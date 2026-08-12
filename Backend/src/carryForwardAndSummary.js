const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourdomain.com';

exports.handler = async (event) => {
    // This lambda is meant to be triggered by EventBridge cron
    const isYearEnd = event.isYearEnd === true; // Passed from eventbridge rule input
    
    try {
        // Fetch leave config to know carry forward rules
        const configScan = await ddbDocClient.send(new ScanCommand({ TableName: 'leave_config' }));
        const configs = {};
        configScan.Items.forEach(item => {
            configs[item.config_key] = item;
        });

        // Scan all balances
        // Note: For production with thousands of users, replace Scan with a more robust batch processing architecture
        const balances = await ddbDocClient.send(new ScanCommand({ TableName: 'leave_balances' }));

        for (const balance of balances.Items) {
            const leaveTypeConfigKey = `LEAVE_TYPE#${balance['leave_type#year'].split('#')[0]}`;
            const configStr = configs[leaveTypeConfigKey]?.value;
            if (!configStr) continue;
            
            const config = JSON.parse(configStr);

            if (isYearEnd && config.carry_forward) {
                // Example simplified carry forward logic
                const daysRemaining = (balance.entitled + (balance.carry_forward || 0)) - (balance.used || 0);
                const nextYear = parseInt(balance['leave_type#year'].split('#')[1]) + 1;
                const nextYearKey = `${balance['leave_type#year'].split('#')[0]}#${nextYear}`;

                // Create or update next year's record
                await ddbDocClient.send(new UpdateCommand({
                    TableName: 'leave_balances',
                    Key: { employee_id: balance.employee_id, 'leave_type#year': nextYearKey },
                    UpdateExpression: 'SET carry_forward = :cf, entitled = :entitled, updated_at = :now',
                    ExpressionAttributeValues: {
                        ':cf': daysRemaining,
                        ':entitled': config.quota,
                        ':now': new Date().toISOString()
                    }
                }));
            } else if (!isYearEnd) {
                // Weekly Summary Email
                const daysRemaining = (balance.entitled + (balance.carry_forward || 0)) - (balance.used || 0);
                await sesClient.send(new SendEmailCommand({
                    FromEmailAddress: SENDER_EMAIL,
                    Destination: { ToAddresses: [balance.employee_id] }, // Assuming email is employee_id
                    Content: {
                        Simple: {
                            Subject: { Data: 'Weekly Leave Balance Summary' },
                            Body: { Text: { Data: `Your current balance for ${balance['leave_type#year']} is ${daysRemaining} days.` } }
                        }
                    }
                }));
            }
        }
        
        return { statusCode: 200, body: 'Job completed successfully' };

    } catch (error) {
        console.error('Error running scheduled job:', error);
        throw error;
    }
};
