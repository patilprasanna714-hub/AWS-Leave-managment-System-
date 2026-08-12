# Ultimate Beginner's Guide to Deploying Your SLAMS Backend

Don't worry if you've never used AWS before! This guide will walk you through every single step from scratch. As part of your internship at F13 Technologies, you've been assigned this backend task, and I've already written all the code for you. 

Here is exactly how you deploy it, step-by-step.

---

## Step 0: Create Your Free AWS Account

Since your company expects you to use your own account, you can easily create an AWS Free Tier account using your personal Gmail address. The services we are using (Lambda, DynamoDB, Step Functions) have massive free tiers, so you won't be charged for this internship project.

### Part A: Sign up for AWS
1. Go to [aws.amazon.com](https://aws.amazon.com/) and click **Create an AWS Account**.
2. Enter your Gmail address and follow the sign-up process. 
3. *Note: AWS will ask for a credit/debit card for identity verification (they usually place a temporary $1 charge that is immediately refunded).*
4. Once your account is active, log in to the **AWS Management Console**.

### Part B: Generate Your Access Keys
To connect your computer to your new AWS account, you need special security keys.
1. In the AWS Console, click on your account name in the top right corner and select **Security credentials**.
2. Scroll down to the **Access keys** section.
3. Click the **Create access key** button.
4. Check the box to understand the recommendation, and click **Next** then **Create access key**.
5. You will see an **Access key ID** and a **Secret access key**. Keep this page open, you will need to copy and paste these in Step 1!

---

## Step 1: Install Required Tools on Your Computer

Before you can push the database setup to AWS, your computer needs a few tools.

### 1. Install Node.js
1. Go to [nodejs.org](https://nodejs.org/) and download the **LTS (Long Term Support)** version for Windows.
2. Run the installer and click "Next" through all the default options until it finishes.

### 2. Install AWS CLI (Command Line Interface)
1. Go to the [AWS CLI download page](https://awscli.amazonaws.com/AWSCLIV2.msi).
2. Download and run the installer for Windows.

### 3. Link Your Computer to AWS
1. Open a new Command Prompt or PowerShell window.
2. Type `aws configure` and press Enter.
3. It will ask for 4 things. Paste the details Sasikumar gave you:
   - **AWS Access Key ID:** Paste your key and press Enter.
   - **AWS Secret Access Key:** Paste your secret and press Enter.
   - **Default region name:** Type `us-east-1` and press Enter.
   - **Default output format:** Type `json` and press Enter.

---

## Step 2: Create the Database (DynamoDB)

Now you will use the script I wrote to create your tables in the cloud.

1. Open PowerShell or Command Prompt.
2. Type this command to go into your backend folder and press Enter:
   ```bash
   cd "C:\Users\sasik\Desktop\F13 Internship\project 1\AWS-Leave-managment-System-\Backend"
   ```
3. Type this command to install the required code packages:
   ```bash
   npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb uuid
   ```
4. Now, run the database setup script I wrote for you:
   ```bash
   node scripts/setup-db.js
   ```
5. You should see messages saying "Successfully created table...". **Your database is now live in the cloud!**

---

## Step 3: Deploy the Code (AWS Lambda)

Now we will put the code I wrote for you into the cloud.

1. Go to your web browser and log into the **AWS Management Console** (using the login link Sasikumar gives you).
2. At the top left, click the search bar, type **Lambda**, and click it.
3. Click the orange **Create function** button.
4. Fill out the form:
   - **Function name:** Type `submitLeaveRequest`
   - **Runtime:** Choose **Node.js 20.x**
   - Click the orange **Create function** button at the bottom.
5. You will see a code editor in the middle of the screen. 
6. On your computer, open `Backend/src/submitLeaveRequest.js`. **Copy ALL the text inside.**
7. Go back to the AWS website, delete the default code in the editor, and **Paste** your code.
8. Click the white **Deploy** button above the code editor.
9. **Repeat this exact process** for your other 4 functions:
   - `approveRejectRequest` (copy from `Backend/src/approveRejectRequest.js`)
   - `finalizeApprovalRequest` (copy from `Backend/src/finalizeApprovalRequest.js`)
   - `reportsCalendar` (copy from `Backend/src/reportsCalendar.js`)
   - `carryForwardAndSummary` (copy from `Backend/src/carryForwardAndSummary.js`)

---

## Step 4: Create the Approval Workflow (Step Functions)

This is the engine that handles the multi-level approvals.

1. In the AWS Console search bar at the top, type **Step Functions** and click it.
2. Click the orange **Create state machine** button.
3. Select the **Blank** template and click **Select**.
4. In the top middle, click on the **Code** tab to switch to the code view.
5. On your computer, open the `Backend/step-functions.json` file. Copy all the text.
6. Delete whatever is in the AWS Code box and **Paste** your code.
7. Click the orange **Create** button. (If it asks for permissions, choose "Create new role").

---

## Step 5: Handoff to Your Teammates!

You have successfully deployed your backend code to AWS! Now you just need to tell your team so they can finish their parts.

Send a message in your team chat:
> *"Hey team, my backend Lambdas, DynamoDB tables, and Step Functions workflow are deployed to the AWS account. Sasikumar, my Lambdas are ready for you to attach to the API Gateway. Virajith, once Sasikumar sets up the API URLs, the endpoints will be ready for the frontend!"*
