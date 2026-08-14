const { LambdaClient, UpdateFunctionConfigurationCommand, GetFunctionConfigurationCommand } = require("@aws-sdk/client-lambda");

const REGION = process.env.AWS_REGION || 'ap-south-1';
const lambdaClient = new LambdaClient({ region: REGION });

const API_GATEWAY_URL = 'https://0q3z55d142.execute-api.ap-south-1.amazonaws.com';

async function updateEnv(functionName) {
    try {
        console.log(`Updating ${functionName}...`);
        
        // Fetch existing config to preserve other environment variables
        const config = await lambdaClient.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
        const existingEnv = config.Environment?.Variables || {};
        
        // Add or update the API_GATEWAY_URL
        const newEnv = {
            ...existingEnv,
            API_GATEWAY_URL: API_GATEWAY_URL
        };

        // Update the function
        await lambdaClient.send(new UpdateFunctionConfigurationCommand({
            FunctionName: functionName,
            Environment: { Variables: newEnv }
        }));
        
        console.log(`✅ Successfully updated API_GATEWAY_URL for ${functionName}`);
    } catch (error) {
        console.error(`❌ Error updating ${functionName}:`, error.message);
    }
}

async function run() {
    await updateEnv('notifyManager');
    await updateEnv('notifyHRAdmin');
}

run();
