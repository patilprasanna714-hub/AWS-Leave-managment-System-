const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourdomain.com';
const HR_EMAIL = process.env.HR_EMAIL || 'hr@yourdomain.com';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'https://api.example.com/approveReject';
const HR_SNS_TOPIC = process.env.HR_SNS_TOPIC_ARN;
const SECRET_NAME = process.env.TOKEN_SECRET_NAME || 'slams-approval-secret';

exports.handler = async (event) => {
    try {
        const { request_id, employee_id, taskToken, escalated } = event;

        // 1. Get Secret for signing tokens
        const secretResult = await smClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
        const secret = secretResult.SecretString;

        // 2. Generate Approval Token
        const payload = {
            employee_id,
            request_id,
            role: 'hr',
            expiry: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
            taskToken,
            nonce: crypto.randomBytes(8).toString('hex')
        };
        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
        const token = `${payloadB64}.${signature}`;

        // 3. Construct Approval Links
        const approveLink = `${API_GATEWAY_URL}?token=${encodeURIComponent(token)}&action=approve`;
        const rejectLink = `${API_GATEWAY_URL}?token=${encodeURIComponent(token)}&action=reject`;

        const subject = escalated 
            ? 'ESCALATED: Leave Request HR Approval'
            : 'Action Required: Leave Request HR Approval';

        const messageBody = `
            Leave Request for Employee: ${employee_id}
            Request ID: ${request_id}
            Escalated from Manager: ${escalated ? 'YES' : 'NO'}
            
            Please approve or reject this request:
            Approve: ${approveLink}
            Reject: ${rejectLink}
        `;

        const htmlBody = `
            <h2>${escalated ? 'ESCALATED: ' : ''}HR Leave Request Approval</h2>
            <p><strong>Employee ID:</strong> ${employee_id}</p>
            <p><strong>Request ID:</strong> ${request_id}</p>
            <p><strong>Escalated:</strong> ${escalated ? 'Yes' : 'No'}</p>
            <br/>
            <a href="${approveLink}" style="padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none;">Approve</a>
            &nbsp;&nbsp;
            <a href="${rejectLink}" style="padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none;">Reject</a>
        `;

        // 4. Send SES Email
        await sesClient.send(new SendEmailCommand({
            FromEmailAddress: SENDER_EMAIL,
            Destination: { ToAddresses: [HR_EMAIL] }, 
            Content: {
                Simple: {
                    Subject: { Data: subject },
                    Body: { 
                        Text: { Data: messageBody },
                        Html: { Data: htmlBody }
                    }
                }
            }
        }));

        // 5. Publish to SNS (if configured)
        if (HR_SNS_TOPIC) {
            await snsClient.send(new PublishCommand({
                TopicArn: HR_SNS_TOPIC,
                Message: messageBody,
                Subject: subject
            }));
        }

        return { statusCode: 200, body: 'Notifications sent successfully' };

    } catch (error) {
        console.error('Error sending notifications:', error);
        throw error; // Let Step Functions catch the error and retry or fail
    }
};
