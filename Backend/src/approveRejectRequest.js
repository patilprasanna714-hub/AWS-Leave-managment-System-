const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } = require('@aws-sdk/client-sfn');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'us-east-1' });
const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

const SECRET_NAME = process.env.TOKEN_SECRET_NAME || 'slams-approval-secret';

exports.handler = async (event) => {
    try {
        const { token, action } = event.queryStringParameters || {};
        
        if (!token || !action) {
            return { statusCode: 400, body: 'Missing token or action' };
        }

        // 1. Get secret
        const secretResult = await smClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
        const secret = secretResult.SecretString;

        // 2. Decode and verify token
        // Token format expected: base64(json({ employee_id, request_id, role, expiry, taskToken, nonce })) + "." + signature
        const [payloadB64, signature] = token.split('.');
        const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

        if (signature !== expectedSignature) {
            return { statusCode: 403, body: 'Invalid signature' };
        }

        const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));

        if (Date.now() > payload.expiry) {
            return { statusCode: 403, body: 'Token expired' };
        }

        // 3. Check single-use against approval_token_hash in leave_requests
        const requestRecord = await ddbDocClient.send(new GetCommand({
            TableName: 'leave_requests',
            Key: { employee_id: payload.employee_id, request_id: payload.request_id }
        }));

        if (!requestRecord.Item) {
            return { statusCode: 404, body: 'Request not found' };
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        // Ensure token hasn't been used yet (this logic requires storing tokenHash when generating it, or checking if it's already in a list of used hashes)
        if (requestRecord.Item.approval_token_hash === tokenHash) {
             return { statusCode: 403, body: 'Token already used' };
        }

        // 4. Update Step Functions
        const isApproved = action.toLowerCase() === 'approve';
        
        try {
            if (isApproved) {
                await sfnClient.send(new SendTaskSuccessCommand({
                    taskToken: payload.taskToken,
                    output: JSON.stringify({ decision: "approve", approver: payload.role })
                }));
            } else {
                await sfnClient.send(new SendTaskSuccessCommand({ 
                    taskToken: payload.taskToken,
                    output: JSON.stringify({ decision: "reject", approver: payload.role })
                }));
            }
        } catch (sfnErr) {
            console.error('Step Functions Callback Error:', sfnErr);
            return { statusCode: 500, body: 'Failed to communicate with workflow engine' };
        }

        // 5. Mark token as used
        await ddbDocClient.send(new UpdateCommand({
            TableName: 'leave_requests',
            Key: { employee_id: payload.employee_id, request_id: payload.request_id },
            UpdateExpression: 'SET approval_token_hash = :hash',
            ExpressionAttributeValues: { ':hash': tokenHash }
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<html><body><h1>Request ${isApproved ? 'Approved' : 'Rejected'}</h1><p>You can close this window.</p></body></html>`
        };

    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: 'Internal Server Error' };
    }
};
