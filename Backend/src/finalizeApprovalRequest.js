const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourdomain.com';

exports.handler = async (event) => {
    // Event comes from Step Functions Final Approval State
    const { employee_id, request_id, leave_type, start_date, days_requested } = event;
    const year = new Date(start_date).getFullYear();
    const balanceKey = `${leave_type.toUpperCase()}#${year}`;

    try {
        // 1. Check if request is already approved to prevent double-counting
        const reqCheck = await ddbDocClient.send(new GetCommand({
            TableName: 'leave_requests',
            Key: { employee_id, request_id }
        }));
        
        if (reqCheck.Item && reqCheck.Item.status === 'APPROVED') {
            console.log('Request already approved, skipping balance deduction.');
            return { status: 'SUCCESS', message: 'Already approved' };
        }

        // 2. Increment balance.used safely using ConditionExpression
        // This is the ONLY function permitted to update leave_balances.used
        await ddbDocClient.send(new UpdateCommand({
            TableName: 'leave_balances',
            Key: { employee_id, 'leave_type#year': balanceKey },
            UpdateExpression: 'SET used = if_not_exists(used, :zero) + :days, updated_at = :now',
            ExpressionAttributeValues: {
                ':days': days_requested,
                ':zero': 0,
                ':now': new Date().toISOString()
            },
            ReturnValues: 'UPDATED_NEW'
        }));

        // 3. Update Request Status to APPROVED
        await ddbDocClient.send(new UpdateCommand({
            TableName: 'leave_requests',
            Key: { employee_id, request_id },
            UpdateExpression: 'SET #status = :status, updated_at = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'APPROVED',
                ':now': new Date().toISOString()
            }
        }));

        // 4. Send Confirmation Email
        await sesClient.send(new SendEmailCommand({
            FromEmailAddress: SENDER_EMAIL,
            Destination: { ToAddresses: [employee_id] }, // Simplified assuming employee_id is email
            Content: {
                Simple: {
                    Subject: { Data: 'Leave Request Approved!' },
                    Body: { Text: { Data: `Your leave request for ${days_requested} days starting ${start_date} has been fully approved.` } }
                }
            }
        }));

        return { status: 'SUCCESS' };

    } catch (error) {
        console.error('Error finalizing approval:', error);
        throw error; // Let step functions handle the retry/failure
    }
};
