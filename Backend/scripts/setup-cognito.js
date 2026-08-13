const { 
    CognitoIdentityProviderClient, 
    CreateUserPoolCommand, 
    CreateGroupCommand, 
    CreateUserPoolClientCommand 
} = require("@aws-sdk/client-cognito-identity-provider");

const REGION = process.env.AWS_REGION || 'ap-south-1'; // Ensure this matches your active AWS region
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

const VIRAJITH_CODESPACE_URL = "https://literate-halibut-wrxvg57jv7wrc96xv-5173.app.github.dev";

async function setupCognito() {
    try {
        console.log("🚀 Starting Cognito Setup...");

        // 1. Create User Pool
        console.log("\nCreating User Pool 'SLAMS-UserPool'...");
        const createUserPoolResponse = await cognitoClient.send(new CreateUserPoolCommand({
            PoolName: "SLAMS-UserPool",
            AutoVerifiedAttributes: ["email"],
            UsernameAttributes: ["email"],
            Policies: {
                PasswordPolicy: {
                    MinimumLength: 8,
                    RequireUppercase: true,
                    RequireLowercase: true,
                    RequireNumbers: true,
                    RequireSymbols: false
                }
            }
        }));

        const userPoolId = createUserPoolResponse.UserPool.Id;
        console.log(`✅ User Pool Created! ID: ${userPoolId}`);

        // 2. Create User Groups
        const groups = ["Employee", "Manager", "HRAdmin"];
        console.log("\nCreating Role Groups...");
        for (const group of groups) {
            await cognitoClient.send(new CreateGroupCommand({
                GroupName: group,
                UserPoolId: userPoolId,
                Description: `${group} role group for SLAMS`
            }));
            console.log(`✅ Group '${group}' created.`);
        }

        // 3. Create App Client with Virajith's Codespace URL
        console.log("\nCreating App Client for Frontend...");
        const createAppClientResponse = await cognitoClient.send(new CreateUserPoolClientCommand({
            UserPoolId: userPoolId,
            ClientName: "SLAMS-Frontend-Client",
            GenerateSecret: false,
            ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"],
            CallbackURLs: [VIRAJITH_CODESPACE_URL],
            LogoutURLs: [VIRAJITH_CODESPACE_URL],
            SupportedIdentityProviders: ["COGNITO"],
            AllowedOAuthFlows: ["code", "implicit"],
            AllowedOAuthScopes: ["phone", "email", "openid", "profile"],
            AllowedOAuthFlowsUserPoolClient: true
        }));

        const clientId = createAppClientResponse.UserPoolClient.ClientId;
        console.log(`✅ App Client Created! Client ID: ${clientId}`);

        console.log("\n=============================================");
        console.log("✅ COGNITO SETUP COMPLETE ✅");
        console.log("=============================================\n");
        console.log("Send the following details to Virajith to update his Frontend `.env` file:\n");
        console.log(`VITE_AWS_REGION=${REGION}`);
        console.log(`VITE_COGNITO_USER_POOL_ID=${userPoolId}`);
        console.log(`VITE_COGNITO_CLIENT_ID=${clientId}`);
        console.log("\n=============================================\n");

    } catch (error) {
        console.error("❌ Error setting up Cognito:", error.message);
    }
}

setupCognito();
