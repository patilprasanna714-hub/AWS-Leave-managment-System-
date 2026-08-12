const { DynamoDBClient, CreateTableCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function createTable(params) {
  try {
    console.log(`Creating table ${params.TableName}...`);
    const command = new CreateTableCommand(params);
    await client.send(command);
    console.log(`Successfully created table ${params.TableName}.`);
  } catch (err) {
    if (err.name === 'ResourceInUseException') {
      console.log(`Table ${params.TableName} already exists.`);
    } else {
      console.error(`Error creating table ${params.TableName}:`, err);
    }
  }
}

async function seedConfig() {
  const configs = [
    { config_key: { S: 'LEAVE_TYPE#SICK' }, value: { S: JSON.stringify({ quota: 10, carry_forward: false }) }, is_active: { BOOL: true } },
    { config_key: { S: 'LEAVE_TYPE#CASUAL' }, value: { S: JSON.stringify({ quota: 10, carry_forward: false }) }, is_active: { BOOL: true } },
    { config_key: { S: 'LEAVE_TYPE#EARNED' }, value: { S: JSON.stringify({ quota: 15, carry_forward: true }) }, is_active: { BOOL: true } },
    { config_key: { S: 'POLICY#HR_APPROVAL_THRESHOLD' }, value: { N: '5' }, is_active: { BOOL: true } },
    { config_key: { S: 'POLICY#MANAGER_TIMEOUT_HOURS' }, value: { N: '48' }, is_active: { BOOL: true } },
  ];

  for (const item of configs) {
    try {
      await client.send(new PutItemCommand({
        TableName: 'leave_config',
        Item: item
      }));
      console.log(`Seeded config: ${item.config_key.S}`);
    } catch (err) {
      console.error(`Error seeding config ${item.config_key.S}:`, err);
    }
  }
}

async function main() {
  // 1. leave_requests
  await createTable({
    TableName: 'leave_requests',
    KeySchema: [
      { AttributeName: 'employee_id', KeyType: 'HASH' },
      { AttributeName: 'request_id', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'employee_id', AttributeType: 'S' },
      { AttributeName: 'request_id', AttributeType: 'S' },
      { AttributeName: 'manager_id', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'start_date', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'manager_id-status-index',
        KeySchema: [
          { AttributeName: 'manager_id', KeyType: 'HASH' },
          { AttributeName: 'status', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'status-start_date-index',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'start_date', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  });

  // 2. leave_balances
  await createTable({
    TableName: 'leave_balances',
    KeySchema: [
      { AttributeName: 'employee_id', KeyType: 'HASH' },
      { AttributeName: 'leave_type#year', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'employee_id', AttributeType: 'S' },
      { AttributeName: 'leave_type#year', AttributeType: 'S' }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  });

  // 3. leave_config
  await createTable({
    TableName: 'leave_config',
    KeySchema: [
      { AttributeName: 'config_key', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'config_key', AttributeType: 'S' }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  });

  // Wait a moment for tables to be active before seeding
  console.log('Waiting 10 seconds for tables to become active before seeding data...');
  setTimeout(seedConfig, 10000);
}

main();
