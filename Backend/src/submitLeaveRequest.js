const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StartExecutionCommand, StopExecutionCommand } = require('@aws-sdk/client-sfn');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { v4: uuidv4 } = require('uuid');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'us-east-1' });
const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourdomain.com';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN; // Set in Lambda environment variables

exports.handler = async (event) => {
    try {
        // Handle cancel request
        if (event.httpMethod === 'POST' && event.path.endsWith('/cancel')) {
            return await handleCancel(event);
        }

        // Parse input
        const body = JSON.parse(event.body);
        const { employee_id, leave_type, start_date, end_date, days_requested, reason, manager_id } = body;
        
        // 1. Validate leave_type against config
        const configResult = await ddbDocClient.send(new GetCommand({
            TableName: 'leave_config',
            Key: { config_key: `LEAVE_TYPE#${leave_type.toUpperCase()}` }
        }));
        
        if (!configResult.Item || !configResult.Item.is_active) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid or inactive leave type' }) };
        }

        // 2. Read leave_balances
        const year = new Date(start_date).getFullYear();
        const balanceResult = await ddbDocClient.send(new GetCommand({
            TableName: 'leave_balances',
            Key: { employee_id, 'leave_type#year': `${leave_type.toUpperCase()}#${year}` }
        }));
        
        const balance = balanceResult.Item || { entitled: 0, carry_forward: 0, used: 0 };
        const daysRemaining = (balance.entitled + (balance.carry_forward || 0)) - (balance.used || 0);

        if (daysRemaining < days_requested) {
            await sendRejectionEmail(employee_id, `Insufficient balance. You requested ${days_requested} but only have ${daysRemaining} days left.`);
            return saveRequest(body, 'AUTO_REJECTED', 'Insufficient balance');
        }

        // 3. Query leave_requests for date overlap
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
                ':status': 'APPROVED', // Also checking PENDING_MANAGER/PENDING_HR would be ideal
                ':start_date': start_date,
                ':end_date': end_date,
                ':employee_id': employee_id
            }
        }));

        if (overlapResult.Items && overlapResult.Items.length > 0) {
            await sendRejectionEmail(employee_id, 'Overlapping leave request found.');
            return saveRequest(body, 'AUTO_REJECTED', 'Overlapping leave dates');
        }

        // 4. Happy Path - Write PENDING_MANAGER and Start Step Functions
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

        // Start Step Functions execution
        const sfnResponse = await sfnClient.send(new StartExecutionCommand({
            stateMachineArn: STATE_MACHINE_ARN,
            name: request_id, // Ensure uniqueness
            input: JSON.stringify(requestItem)
        }));

        requestItem.step_functions_execution_arn = sfnResponse.executionArn;

        await ddbDocClient.send(new PutCommand({
            TableName: 'leave_requests',
            Item: requestItem
        }));

        return { statusCode: 201, body: JSON.stringify({ message: 'Request submitted', request_id }) };
        
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};

async function handleCancel(event) {
    const request_id = event.pathParameters.request_id;
    const body = JSON.parse(event.body);
    const employee_id = body.employee_id;

    // Get the request to find the step function arn
    const request = await ddbDocClient.send(new GetCommand({
        TableName: 'leave_requests',
        Key: { employee_id, request_id }
    }));

    if (!request.Item || (request.Item.status !== 'PENDING_MANAGER' && request.Item.status !== 'PENDING_HR')) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Can only cancel pending requests' }) };
    }

    if (request.Item.step_functions_execution_arn) {
        await sfnClient.send(new StopExecutionCommand({
            executionArn: request.Item.step_functions_execution_arn,
            cause: 'Cancelled by employee'
        }));
    }

    await ddbDocClient.send(new UpdateCommand({
        TableName: 'leave_requests',
        Key: { employee_id, request_id },
        UpdateExpression: 'SET #status = :status, updated_at = :updated_at',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'CANCELLED', ':updated_at': new Date().toISOString() }
    }));

    return { statusCode: 200, body: JSON.stringify({ message: 'Request cancelled successfully' }) };
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
    return { statusCode: 200, body: JSON.stringify({ message: 'Request ' + status, reason: rejectionReason }) };
}

async function sendRejectionEmail(email, message) {
    try {
        await sesClient.send(new SendEmailCommand({
            FromEmailAddress: SENDER_EMAIL,
            Destination: { ToAddresses: [email] }, // Assuming employee_id is email for simplicity
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
