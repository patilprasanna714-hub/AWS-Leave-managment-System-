const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
    try {
        console.log('Received event:', JSON.stringify(event, null, 2));
        
        const path = event.path || event.rawPath || '';
        const method = event.requestContext?.http?.method || event.httpMethod || 'GET';

        if (method === 'GET' && path.startsWith('/balances/')) {
            const employee_id = event.pathParameters?.employee_id;
            if (!employee_id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Missing employee_id' }) };
            }
            return await getBalances(employee_id);
        }

        if (method === 'GET' && path.startsWith('/leave-requests/')) {
            const employee_id = event.pathParameters?.employee_id;
            if (!employee_id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Missing employee_id' }) };
            }
            return await getLeaveHistory(employee_id);
        }

        if (method === 'GET' && path === '/approvals/pending') {
            const manager_id = event.queryStringParameters?.manager_id;
            return await getPendingApprovals(manager_id);
        }

        if (method === 'GET' && path === '/calendar') {
            const startDate = event.queryStringParameters?.start_date;
            const endDate = event.queryStringParameters?.end_date;
            return await getCalendar(startDate, endDate);
        }

        return { statusCode: 404, body: JSON.stringify({ error: 'Not Found' }) };
    } catch (error) {
        console.error('Error in reports/calendar lambda:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Internal Server Error' }) };
    }
};

async function getBalances(employee_id) {
    try {
        console.log(`Fetching balances for employee: ${employee_id}`);
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: 'leave_balances',
            KeyConditionExpression: 'employee_id = :empId',
            ExpressionAttributeValues: { ':empId': employee_id }
        }));
        console.log(`Successfully fetched balances: ${JSON.stringify(result.Items)}`);
        return { 
            statusCode: 200, 
            body: JSON.stringify(result.Items || []),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error(`Error fetching balances for ${employee_id}:`, error);
        throw error;
    }
}

async function getLeaveHistory(employee_id) {
    try {
        console.log(`Fetching leave history for employee: ${employee_id}`);
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: 'leave_requests',
            KeyConditionExpression: 'employee_id = :empId',
            ExpressionAttributeValues: { ':empId': employee_id }
        }));
        console.log(`Successfully fetched leave history: ${JSON.stringify(result.Items)}`);
        return { 
            statusCode: 200, 
            body: JSON.stringify(result.Items || []),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error(`Error fetching leave history for ${employee_id}:`, error);
        throw error;
    }
}

async function getPendingApprovals(manager_id) {
    try {
        if (!manager_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing manager_id' }), headers: { 'Content-Type': 'application/json' } };
        }
        
        console.log(`Fetching pending approvals for manager: ${manager_id}`);
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: 'leave_requests',
            IndexName: 'manager_id-status-index',
            KeyConditionExpression: 'manager_id = :mgrId AND #status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':mgrId': manager_id, ':status': 'PENDING_MANAGER' }
        }));
        console.log(`Successfully fetched pending approvals: ${JSON.stringify(result.Items)}`);
        return { 
            statusCode: 200, 
            body: JSON.stringify(result.Items || []),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error(`Error fetching pending approvals for ${manager_id}:`, error);
        throw error;
    }
}

async function getCalendar(startDate, endDate) {
    try {
        if (!startDate || !endDate) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing start_date or end_date' }), headers: { 'Content-Type': 'application/json' } };
        }

        console.log(`Fetching calendar for dates: ${startDate} to ${endDate}`);
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: 'leave_requests',
            IndexName: 'status-start_date-index',
            KeyConditionExpression: '#status = :status AND start_date BETWEEN :start AND :end',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': 'APPROVED', ':start': startDate, ':end': endDate }
        }));
        console.log(`Successfully fetched calendar data: ${JSON.stringify(result.Items)}`);
        return { 
            statusCode: 200, 
            body: JSON.stringify(result.Items || []),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error(`Error fetching calendar data:`, error);
        throw error;
    }
}
