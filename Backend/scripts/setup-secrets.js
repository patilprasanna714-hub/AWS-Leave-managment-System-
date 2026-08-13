const { SecretsManagerClient, CreateSecretCommand, DescribeSecretCommand } = require("@aws-sdk/client-secrets-manager");
const crypto = require("crypto");

const REGION = process.env.AWS_REGION || 'ap-south-1'; // Ensure this matches your active AWS region
const secretsClient = new SecretsManagerClient({ region: REGION });

async function setupSecret() {
    const secretName = "smart-leave/approval-token";
    // Generate a strong random string for security
    const randomSecret = crypto.randomBytes(32).toString('hex');
    const secretString = JSON.stringify({ "TOKEN_SECRET": randomSecret });

    console.log("🔒 Setting up AWS Secrets Manager...");

    try {
        // 1. Check if the secret already exists to avoid errors
        try {
            await secretsClient.send(new DescribeSecretCommand({ SecretId: secretName }));
            console.log(`✅ Secret '${secretName}' already exists. No action needed.`);
            return;
        } catch (err) {
            if (err.name !== 'ResourceNotFoundException') {
                throw err;
            }
            // Secret doesn't exist, we will create it
        }

        // 2. Create the secret
        console.log(`Creating new secret: '${secretName}'...`);
        await secretsClient.send(new CreateSecretCommand({
            Name: secretName,
            Description: "Secret token for signing SLAMS approval links",
            SecretString: secretString
        }));

        console.log(`✅ Successfully created secret '${secretName}'!`);
        console.log("Your lambdas can now securely generate approval links.");

    } catch (error) {
        console.error("❌ Error setting up Secrets Manager:", error.message);
    }
}

setupSecret();
