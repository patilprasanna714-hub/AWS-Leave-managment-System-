const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
    try {
        const path = event.path;
        const method = event.httpMethod;

        if (method === 'GET' && path.startsWith('/balances/')) {
            const employee_id = event.pathParameters.employee_id;
            return await getBalances(employee_id);
        }

        if (method === 'GET' && path.startsWith('/leave-requests/')) {
            const employee_id = event.pathParameters.employee_id;
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

        return { statusCode: 404, body: 'Not Found' };
    } catch (error) {
        console.error('Error in reports/calendar lambda:', error);
        return { statusCode: 500, body: 'Internal Server Error' };
    }
};

async function getBalances(employee_id) {
    const result = await ddbDocClient.send(new QueryCommand({
        TableName: 'leave_balances',
        KeyConditionExpression: 'employee_id = :empId',
        ExpressionAttributeValues: { ':empId': employee_id }
    }));
    return { statusCode: 200, body: JSON.stringify(result.Items) };
}

async function getLeaveHistory(employee_id) {
    const result = await ddbDocClient.send(new QueryCommand({
        TableName: 'leave_requests',
        KeyConditionExpression: 'employee_id = :empId',
        ExpressionAttributeValues: { ':empId': employee_id }
    }));
    return { statusCode: 200, body: JSON.stringify(result.Items) };
}

async function getPendingApprovals(manager_id) {
    if (!manager_id) return { statusCode: 400, body: 'Missing manager_id' };
    
    const result = await ddbDocClient.send(new QueryCommand({
        TableName: 'leave_requests',
        IndexName: 'manager_id-status-index',
        KeyConditionExpression: 'manager_id = :mgrId AND #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':mgrId': manager_id, ':status': 'PENDING_MANAGER' }
    }));
    return { statusCode: 200, body: JSON.stringify(result.Items) };
}

async function getCalendar(startDate, endDate) {
    if (!startDate || !endDate) return { statusCode: 400, body: 'Missing start_date or end_date' };

    const result = await ddbDocClient.send(new QueryCommand({
        TableName: 'leave_requests',
        IndexName: 'status-start_date-index',
        KeyConditionExpression: '#status = :status AND start_date BETWEEN :start AND :end',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'APPROVED', ':start': startDate, ':end': endDate }
    }));
    return { statusCode: 200, body: JSON.stringify(result.Items) };
}
