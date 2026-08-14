const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourdomain.com';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'https://api.example.com/approveReject';
const MANAGER_SNS_TOPIC = process.env.MANAGER_SNS_TOPIC_ARN;
const SECRET_NAME = process.env.TOKEN_SECRET_NAME || 'slams-approval-secret';

exports.handler = async (event) => {
    try {
        console.log('NotifyManager event:', JSON.stringify(event, null, 2));
        
        const { request_id, employee_id, manager_id, taskToken } = event;

        if (!request_id || !employee_id || !manager_id || !taskToken) {
            throw new Error(`Missing required parameters: request_id=${request_id}, employee_id=${employee_id}, manager_id=${manager_id}, taskToken=${taskToken ? 'present' : 'missing'}`);
        }

        // 1. Get Secret for signing tokens
        console.log('Fetching secret from Secrets Manager...');
        const secretResult = await smClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
        const secret = secretResult.SecretString;

        // 2. Generate Approval Token
        const payload = {
            employee_id,
            request_id,
            role: 'manager',
            expiry: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
            taskToken,
            nonce: crypto.randomBytes(8).toString('hex')
        };
        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
        const token = `${payloadB64}.${signature}`;

        console.log(`Token generated for request ${request_id}`);

        // 3. Construct Approval Links
        const approveLink = `${API_GATEWAY_URL}?token=${encodeURIComponent(token)}&action=approve`;
        const rejectLink = `${API_GATEWAY_URL}?token=${encodeURIComponent(token)}&action=reject`;

        const messageBody = `
            Leave Request for Employee: ${employee_id}
            Request ID: ${request_id}
            
            Please approve or reject this request:
            Approve: ${approveLink}
            Reject: ${rejectLink}
        `;

        const htmlBody = `
            <h2>Leave Request Approval</h2>
            <p><strong>Employee ID:</strong> ${employee_id}</p>
            <p><strong>Request ID:</strong> ${request_id}</p>
            <br/>
            <a href="${approveLink}" style="padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none;">Approve</a>
            &nbsp;&nbsp;
            <a href="${rejectLink}" style="padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none;">Reject</a>
        `;

        // 4. Send SES Email (Assuming manager_id is their email for now)
        console.log(`Sending email to manager: ${manager_id}`);
        await sesClient.send(new SendEmailCommand({
            FromEmailAddress: SENDER_EMAIL,
            Destination: { ToAddresses: [manager_id] }, 
            Content: {
                Simple: {
                    Subject: { Data: 'Action Required: Leave Request Approval' },
                    Body: { 
                        Text: { Data: messageBody },
                        Html: { Data: htmlBody }
                    }
                }
            }
        }));

        console.log('Email sent successfully');

        // 5. Publish to SNS (if configured)
        if (MANAGER_SNS_TOPIC) {
            console.log('Publishing to SNS...');
            await snsClient.send(new PublishCommand({
                TopicArn: MANAGER_SNS_TOPIC,
                Message: messageBody,
                Subject: 'Action Required: Leave Request Approval'
            }));
        }

        console.log('NotifyManager completed successfully');
        return { statusCode: 200, body: JSON.stringify({ message: 'Notifications sent successfully' }) };

    } catch (error) {
        console.error('Error sending notifications:', error);
        throw error; // Let Step Functions catch the error and retry or fail
    }
};
