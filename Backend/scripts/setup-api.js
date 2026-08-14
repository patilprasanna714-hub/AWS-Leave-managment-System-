const { ApiGatewayV2Client, CreateApiCommand, CreateIntegrationCommand, CreateRouteCommand, CreateStageCommand } = require("@aws-sdk/client-apigatewayv2");
const { LambdaClient, AddPermissionCommand } = require("@aws-sdk/client-lambda");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");

const REGION = process.env.AWS_REGION || 'ap-south-1';

const apiGatewayClient = new ApiGatewayV2Client({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
const stsClient = new STSClient({ region: REGION });

const VIRAJITH_CODESPACE_URL = "https://literate-halibut-wrxvg57jv7wrc96xv-5173.app.github.dev";

async function setupApiGateway() {
    try {
        console.log("Fetching AWS Account Details...");
        const stsResponse = await stsClient.send(new GetCallerIdentityCommand({}));
        const accountId = stsResponse.Account;
        console.log(`Successfully connected to AWS Account: ${accountId}`);

        console.log("\nCreating HTTP API...");
        const createApiResponse = await apiGatewayClient.send(new CreateApiCommand({
            Name: "SLAMS-API",
            ProtocolType: "HTTP",
            CorsConfiguration: {
                AllowOrigins: [VIRAJITH_CODESPACE_URL],
                AllowMethods: ["*"],
                AllowHeaders: ["*"],
                AllowCredentials: true
            }
        }));
        
        const apiId = createApiResponse.ApiId;
        const apiEndpoint = createApiResponse.ApiEndpoint;
        console.log(`API Created Successfully. API ID: ${apiId}`);

        // Helper function to connect a Lambda to API Gateway routes
        async function attachLambdaToRoutes(lambdaName, routes) {
            console.log(`\nConnecting Lambda: ${lambdaName}`);
            const lambdaArn = `arn:aws:lambda:${REGION}:${accountId}:function:${lambdaName}`;

            // 1. Give API Gateway permission to invoke the lambda
            try {
                await lambdaClient.send(new AddPermissionCommand({
                    FunctionName: lambdaName,
                    StatementId: `apigw-${apiId}-${Date.now()}`,
                    Action: "lambda:InvokeFunction",
                    Principal: "apigateway.amazonaws.com",
                    SourceArn: `arn:aws:execute-api:${REGION}:${accountId}:${apiId}/*/*`
                }));
                console.log(`  ✓ Granted invoke permissions`);
            } catch (err) {
                if (err.name === 'ResourceConflictException') {
                    console.log(`  ✓ Permissions already exist`);
                } else {
                    console.warn(`  ! Could not add permission (might already exist or lambda missing): ${err.message}`);
                }
            }

            // 2. Create the integration
            const integrationResponse = await apiGatewayClient.send(new CreateIntegrationCommand({
                ApiId: apiId,
                IntegrationType: "AWS_PROXY",
                IntegrationUri: lambdaArn,
                PayloadFormatVersion: "1.0", // Use 1.0 to preserve event.httpMethod mapping that the Lambdas expect
            }));
            const integrationId = integrationResponse.IntegrationId;
            console.log(`  ✓ Created integration ${integrationId}`);

            // 3. Create the routes
            for (const route of routes) {
                await apiGatewayClient.send(new CreateRouteCommand({
                    ApiId: apiId,
                    RouteKey: route,
                    Target: `integrations/${integrationId}`
                }));
                console.log(`  ✓ Created route: ${route}`);
            }
        }

        // Attach Lambdas to their respective routes
        await attachLambdaToRoutes("submitLeaveRequest", [
            "POST /leave",
            "POST /leave/{request_id}/cancel"
        ]);

        await attachLambdaToRoutes("approveRejectRequest", [
            "GET /approve"
        ]);

        await attachLambdaToRoutes("reportsCalendar", [
            "GET /balances/{employee_id}",
            "GET /leave-requests/{employee_id}",
            "GET /approvals/pending",
            "GET /calendar"
        ]);

        console.log("\nCreating deployment stage...");
        await apiGatewayClient.send(new CreateStageCommand({
            ApiId: apiId,
            StageName: "$default",
            AutoDeploy: true
        }));
        console.log("  ✓ Stage $default created");

        console.log("\n=============================================");
        console.log("✅ API GATEWAY SETUP COMPLETE ✅");
        console.log("=============================================\n");
        console.log("Send the following details to Virajith (Frontend Developer):\n");
        console.log(`1. Base API Gateway URL: ${apiEndpoint}\n`);
        console.log("2. Endpoints:");
        console.log(`   - Submit Leave:        POST ${apiEndpoint}/leave`);
        console.log(`   - Cancel Leave:        POST ${apiEndpoint}/leave/{request_id}/cancel`);
        console.log(`   - Approve/Reject:      GET  ${apiEndpoint}/approve?token={token}&action={approve/reject}`);
        console.log(`   - View Balances:       GET  ${apiEndpoint}/balances/{employee_id}`);
        console.log(`   - View Leave History:  GET  ${apiEndpoint}/leave-requests/{employee_id}`);
        console.log(`   - Pending Approvals:   GET  ${apiEndpoint}/approvals/pending?manager_id={manager_id}`);
        console.log(`   - Company Calendar:    GET  ${apiEndpoint}/calendar?start_date={date}&end_date={date}\n`);
        
        console.log("Next Steps for you:");
        console.log(`Update your notifyManager.js and notifyHRAdmin.js environment variables in the AWS Console to set API_GATEWAY_URL to: ${apiEndpoint}/approve`);

    } catch (error) {
        console.error("Error setting up API Gateway:", error);
    }
}

setupApiGateway();
