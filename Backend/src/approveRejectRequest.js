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
        console.log('Received event:', JSON.stringify(event, null, 2));

        const queryParams = event.queryStringParameters || {};
        const { token, action, request_id: requestId, role } = queryParams;

        if (!action) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing action' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        const isApproved = action.toLowerCase() === 'approve';

        let requestRecord = null;
        let requestLookup = null;
        let payload = null;

        if (token) {
            console.log(`Processing approval via signed token: token=${token.substring(0, 20)}..., action=${action}`);

            const secretResult = await smClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
            const secret = secretResult.SecretString;
            const [payloadB64, signature] = token.split('.');

            if (!payloadB64 || !signature) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid token format' }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }

            const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
            if (signature !== expectedSignature) {
                console.error('Signature mismatch');
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: 'Invalid signature' }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }

            payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));
            if (Date.now() > payload.expiry) {
                console.error('Token expired');
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: 'Token expired' }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }

            requestLookup = {
                employee_id: payload.employee_id,
                request_id: payload.request_id,
            };

            requestRecord = await ddbDocClient.send(new GetCommand({
                TableName: 'leave_requests',
                Key: requestLookup
            }));

            if (!requestRecord.Item) {
                console.error('Request not found');
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: 'Request not found' }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }

            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            if (requestRecord.Item.approval_token_hash === tokenHash) {
                console.error('Token already used');
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: 'Token already used' }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }
        } else if (requestId) {
            console.log(`Processing direct approval for request_id=${requestId}, action=${action}`);

            const scanResult = await ddbDocClient.send(new (require('@aws-sdk/lib-dynamodb').ScanCommand)({
                TableName: 'leave_requests',
                FilterExpression: 'request_id = :requestId AND (status = :pendingManager OR status = :pendingHr)',
                ExpressionAttributeValues: {
                    ':requestId': requestId,
                    ':pendingManager': 'PENDING_MANAGER',
                    ':pendingHr': 'PENDING_HR'
                }
            }));

            if (!scanResult.Items || scanResult.Items.length === 0) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: 'Request not found or not pending' }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }

            requestRecord = { Item: scanResult.Items[0] };
            requestLookup = {
                employee_id: requestRecord.Item.employee_id,
                request_id: requestRecord.Item.request_id,
            };
            payload = {
                employee_id: requestRecord.Item.employee_id,
                request_id: requestRecord.Item.request_id,
                role: role || 'manager',
                taskToken: requestRecord.Item.taskToken || null,
            };
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing token or request_id' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        try {
            if (payload?.taskToken) {
                console.log(`Sending ${isApproved ? 'approve' : 'reject'} decision to Step Functions`);
                await sfnClient.send(new SendTaskSuccessCommand({
                    taskToken: payload.taskToken,
                    output: JSON.stringify({ decision: isApproved ? 'approve' : 'reject', approver: payload.role || 'manager' })
                }));
            }
        } catch (sfnErr) {
            console.error('Step Functions Callback Error:', sfnErr);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to communicate with workflow engine' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        const nextStatus = isApproved ? (requestRecord.Item.days_requested > 5 ? 'PENDING_HR' : 'APPROVED') : 'REJECTED';

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'leave_requests',
            Key: requestLookup,
            UpdateExpression: 'SET #status = :status, updated_at = :now, approval_token_hash = if_not_exists(approval_token_hash, :hash)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': nextStatus,
                ':now': new Date().toISOString(),
                ':hash': token ? crypto.createHash('sha256').update(token).digest('hex') : crypto.createHash('sha256').update(requestId).digest('hex')
            }
        }));

        console.log('Approval processed successfully');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<html><body><h1>Request ${isApproved ? 'Approved' : 'Rejected'}</h1><p>You can close this window.</p></body></html>`
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};
