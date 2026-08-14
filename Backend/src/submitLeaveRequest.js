const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StartExecutionCommand, StopExecutionCommand } = require('@aws-sdk/client-sfn');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { randomUUID: uuidv4 } = require('crypto');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourdomain.com';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

exports.handler = async (event) => {
    try {
        console.log('Received event:', JSON.stringify(event, null, 2));
        
        const path = event.rawPath || event.path || '';
        const method = event.requestContext?.http?.method || event.httpMethod || 'POST';

        if (method === 'POST' && path.endsWith('/cancel')) {
            return await handleCancel(event);
        }

        if (method !== 'POST' || !path.includes('/leave')) {
            return { 
                statusCode: 405, 
                body: JSON.stringify({ error: 'Method not allowed' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        let body;
        if (typeof event.body === 'string') {
            const bodyStr = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
            body = JSON.parse(bodyStr);
        } else {
            body = event.body;
        }

        const { employee_id, leave_type, start_date, end_date, days_requested, reason, manager_id } = body;
        
        if (!employee_id || !leave_type || !start_date || !end_date || !days_requested) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Missing required fields' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }
        
        const configResult = await ddbDocClient.send(new GetCommand({
            TableName: 'leave_config',
            Key: { config_key: `LEAVE_TYPE#${leave_type.toUpperCase()}` }
        }));
        
        if (!configResult.Item || !configResult.Item.is_active) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Invalid or inactive leave type' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        const year = new Date(start_date).getFullYear();
        const balanceResult = await ddbDocClient.send(new GetCommand({
            TableName: 'leave_balances',
            Key: { employee_id, 'leave_type#year': `${leave_type.toUpperCase()}#${year}` }
        }));
        
        const balance = balanceResult.Item || { entitled: 0, carry_forward: 0, used: 0 };
        const daysRemaining = (balance.entitled + (balance.carry_forward || 0)) - (balance.used || 0);

        if (daysRemaining < days_requested) {
            const rejectionMsg = `Insufficient balance. You requested ${days_requested} but only have ${daysRemaining} days left.`;
            await sendRejectionEmail(employee_id, rejectionMsg);
            return await saveRequest(body, 'AUTO_REJECTED', rejectionMsg);
        }

        const overlapResult = await ddbDocClient.send(new QueryCommand({
            TableName: 'leave_requests',
            IndexName: 'status-start_date-index',
            KeyConditionExpression: '#status = :status AND #start_date <= :end_date',
            FilterExpression: '#end_date >= :start_date AND #employee_id = :employee_id',
            ExpressionAttributeNames: {
                '#status': 'status',
                '#start_date': 'start_date',
                '#end_date': 'end_date',
                '#employee_id': 'employee_id'
            },
            ExpressionAttributeValues: {
                ':status': 'APPROVED',
                ':start_date': start_date,
                ':end_date': end_date,
                ':employee_id': employee_id
            }
        }));

        if (overlapResult.Items && overlapResult.Items.length > 0) {
            const rejectionMsg = 'Overlapping leave request found.';
            await sendRejectionEmail(employee_id, rejectionMsg);
            return await saveRequest(body, 'AUTO_REJECTED', 'Overlapping leave dates');
        }

        const request_id = uuidv4();
        const now = new Date().toISOString();
        
        const requestItem = {
            employee_id,
            request_id,
            leave_type: leave_type.toUpperCase(),
            start_date,
            end_date,
            days_requested,
            reason,
            manager_id,
            status: 'PENDING_MANAGER',
            created_at: now,
            updated_at: now
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'leave_requests',
            Item: requestItem
        }));

        const sfnInput = {
            request_id,
            employee_id,
            manager_id,
            leave_type: leave_type.toUpperCase(),
            start_date,
            end_date,
            days_requested,
            reason
        };

        const sfnResponse = await sfnClient.send(new StartExecutionCommand({
            stateMachineArn: STATE_MACHINE_ARN,
            name: request_id, 
            input: JSON.stringify(sfnInput)
        }));

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'leave_requests',
            Key: { employee_id, request_id },
            UpdateExpression: 'SET sfn_execution_arn = :arn',
            ExpressionAttributeValues: { ':arn': sfnResponse.executionArn }
        }));

        return { 
            statusCode: 201, 
            body: JSON.stringify({ message: 'Request submitted', request_id }),
            headers: { 'Content-Type': 'application/json' }
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

async function handleCancel(event) {
    try {
        const request_id = event.pathParameters?.request_id;
        
        let body;
        if (typeof event.body === 'string') {
            const bodyStr = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
            body = JSON.parse(bodyStr);
        } else {
            body = event.body;
        }
        const employee_id = body?.employee_id;

        if (!request_id || !employee_id) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Missing request_id or employee_id' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        const request = await ddbDocClient.send(new GetCommand({
            TableName: 'leave_requests',
            Key: { employee_id, request_id }
        }));

        if (!request.Item || (request.Item.status !== 'PENDING_MANAGER' && request.Item.status !== 'PENDING_HR')) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Can only cancel pending requests' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        if (request.Item.sfn_execution_arn) {
            try {
                await sfnClient.send(new StopExecutionCommand({
                    executionArn: request.Item.sfn_execution_arn,
                    cause: 'Cancelled by employee'
                }));
            } catch (err) {
                console.error('Failed to stop state machine:', err);
            }
        }

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'leave_requests',
            Key: { employee_id, request_id },
            UpdateExpression: 'SET #status = :status, updated_at = :updated_at',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': 'CANCELLED', ':updated_at': new Date().toISOString() }
        }));

        return { 
            statusCode: 200, 
            body: JSON.stringify({ message: 'Request cancelled successfully' }),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error('Error cancelling request:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
}

async function saveRequest(body, status, rejectionReason) {
    const request_id = uuidv4();
    const now = new Date().toISOString();
    await ddbDocClient.send(new PutCommand({
        TableName: 'leave_requests',
        Item: {
            employee_id: body.employee_id,
            request_id,
            leave_type: body.leave_type.toUpperCase(),
            start_date: body.start_date,
            end_date: body.end_date,
            days_requested: body.days_requested,
            manager_id: body.manager_id,
            reason: body.reason,
            status: status,
            rejection_reason: rejectionReason,
            created_at: now,
            updated_at: now
        }
    }));
    return { 
        statusCode: 200, 
        body: JSON.stringify({ message: 'Request ' + status, reason: rejectionReason }),
        headers: { 'Content-Type': 'application/json' }
    };
}

async function sendRejectionEmail(email, message) {
    try {
        await sesClient.send(new SendEmailCommand({
            FromEmailAddress: SENDER_EMAIL,
            Destination: { ToAddresses: [email] },
            Content: {
                Simple: {
                    Subject: { Data: 'Leave Request Update' },
                    Body: { Text: { Data: message } }
                }
            }
        }));
    } catch (err) {
        console.error('Failed to send email:', err);
    }
}
