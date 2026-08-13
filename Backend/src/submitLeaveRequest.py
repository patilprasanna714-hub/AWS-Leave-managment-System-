import json
import boto3
import os
import uuid
from datetime import datetime
from decimal import Decimal

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
sfn_client = boto3.client('stepfunctions', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
ses_client = boto3.client('ses', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
sns_client = boto3.client('sns', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
secretsmanager = boto3.client('secretsmanager', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

# Tables
leave_config_table = dynamodb.Table('leave_config')
leave_balances_table = dynamodb.Table('leave_balances')
leave_requests_table = dynamodb.Table('leave_requests')

SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@yourdomain.com')
STATE_MACHINE_ARN = os.environ.get('STATE_MACHINE_ARN')
SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN')

def get_approval_token_secret():
    try:
        response = secretsmanager.get_secret_value(SecretId='smart-leave/approval-token')
        secret_string = response['SecretString']
        return json.loads(secret_string).get('TOKEN_SECRET')
    except Exception as e:
        print(f"Error retrieving secret: {e}")
        return None

def publish_sns_message(employee_id, manager_id, topic_arn):
    if not topic_arn:
        return
    try:
        response = sns_client.publish(
            TopicArn=topic_arn,
            Message=f"New leave request from {employee_id} requires approval by {manager_id}."
        )
        print(f"SNS message published: {response['MessageId']}")
    except Exception as e:
        print(f"Error publishing SNS message: {e}")

def send_rejection_email(email, message):
    try:
        ses_client.send_email(
            Source=SENDER_EMAIL,
            Destination={'ToAddresses': [email]},
            Message={
                'Subject': {'Data': 'Leave Request Update'},
                'Body': {'Text': {'Data': message}}
            }
        )
    except Exception as e:
        print(f"Failed to send email: {e}")

def save_request(body, status, rejection_reason):
    request_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + 'Z'
    leave_requests_table.put_item(
        Item={
            'employee_id': body['employee_id'],
            'request_id': request_id,
            'leave_type': body['leave_type'].upper(),
            'start_date': body['start_date'],
            'end_date': body['end_date'],
            'days_requested': Decimal(str(body['days_requested'])),
            'manager_id': body['manager_id'],
            'reason': body.get('reason', ''),
            'status': status,
            'rejection_reason': rejection_reason,
            'created_at': now,
            'updated_at': now
        }
    )
    return {
        'statusCode': 200,
        'body': json.dumps({'message': f'Request {status}', 'reason': rejection_reason})
    }

def handle_cancel(event):
    path_parameters = event.get('pathParameters', {}) or {}
    request_id = path_parameters.get('request_id')
    body = json.loads(event.get('body', '{}'))
    employee_id = body.get('employee_id')

    response = leave_requests_table.get_item(
        Key={'employee_id': employee_id, 'request_id': request_id}
    )
    item = response.get('Item')

    if not item or item['status'] not in ['PENDING_MANAGER', 'PENDING_HR']:
        return {'statusCode': 400, 'body': json.dumps({'message': 'Can only cancel pending requests'})}
    
    if item.get('step_functions_execution_arn'):
        try:
            sfn_client.stop_execution(
                executionArn=item['step_functions_execution_arn'],
                cause='Cancelled by employee'
            )
        except Exception as e:
            print(f"Error stopping step function: {e}")
            
    leave_requests_table.update_item(
        Key={'employee_id': employee_id, 'request_id': request_id},
        UpdateExpression='SET #status = :status, updated_at = :updated_at',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':status': 'CANCELLED',
            ':updated_at': datetime.utcnow().isoformat() + 'Z'
        }
    )
    
    return {'statusCode': 200, 'body': json.dumps({'message': 'Request cancelled successfully'})}

def lambda_handler(event, context):
    print("Leave request received")
    
    try:
        # Handle cancel request
        if event.get('httpMethod') == 'POST' and event.get('path', '').endswith('/cancel'):
            return handle_cancel(event)
            
        body = json.loads(event.get('body', '{}')) if isinstance(event.get('body'), str) else event.get('body', event)
        employee_id = body.get('employee_id')
        leave_type = body.get('leave_type')
        start_date = body.get('start_date')
        end_date = body.get('end_date')
        days_requested = body.get('days_requested')
        reason = body.get('reason', '')
        manager_id = body.get('manager_id')

        # 1. Validate leave_type against config
        config_response = leave_config_table.get_item(
            Key={'config_key': f"LEAVE_TYPE#{leave_type.upper()}"}
        )
        config_item = config_response.get('Item')
        if not config_item or not config_item.get('is_active'):
            return {'statusCode': 400, 'body': json.dumps({'message': 'Invalid or inactive leave type'})}

        # 2. Read leave_balances
        year = start_date.split('-')[0] if start_date and '-' in start_date else str(datetime.utcnow().year)
        balance_response = leave_balances_table.get_item(
            Key={'employee_id': employee_id, 'leave_type#year': f"{leave_type.upper()}#{year}"}
        )
        balance_item = balance_response.get('Item', {'entitled': 0, 'carry_forward': 0, 'used': 0})
        
        entitled = int(balance_item.get('entitled', 0))
        carry_forward = int(balance_item.get('carry_forward', 0))
        used = int(balance_item.get('used', 0))
        days_remaining = (entitled + carry_forward) - used

        if days_remaining < int(days_requested):
            send_rejection_email(employee_id, f"Insufficient balance. You requested {days_requested} but only have {days_remaining} days left.")
            return save_request(body, 'AUTO_REJECTED', 'Insufficient balance')

        # 3. Query leave_requests for date overlap
        overlap_response = leave_requests_table.query(
            IndexName='status-start_date-index',
            KeyConditionExpression='#status = :status AND #start_date <= :end_date',
            FilterExpression='#end_date >= :start_date AND #employee_id = :employee_id',
            ExpressionAttributeNames={
                '#status': 'status',
                '#start_date': 'start_date',
                '#end_date': 'end_date',
                '#employee_id': 'employee_id'
            },
            ExpressionAttributeValues={
                ':status': 'APPROVED',
                ':start_date': start_date,
                ':end_date': end_date,
                ':employee_id': employee_id
            }
        )
        
        if overlap_response.get('Items'):
            send_rejection_email(employee_id, 'Overlapping leave request found.')
            return save_request(body, 'AUTO_REJECTED', 'Overlapping leave dates')

        # 4. Happy Path - Write PENDING_MANAGER and Start Step Functions
        request_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + 'Z'
        
        request_item = {
            'employee_id': employee_id,
            'request_id': request_id,
            'leave_type': leave_type.upper(),
            'start_date': start_date,
            'end_date': end_date,
            'days_requested': Decimal(str(days_requested)),
            'reason': reason,
            'manager_id': manager_id,
            'status': 'PENDING_MANAGER',
            'created_at': now,
            'updated_at': now
        }

        sfn_input = {
            'request_id': request_id,
            'employee_id': employee_id,
            'manager_id': manager_id,
            'num_days': int(days_requested),
            'leave_type': leave_type.upper(),
            'hr_approval_threshold_days': int(config_item.get('hr_approval_threshold_days', 5)),
            'manager_timeout_seconds': int(config_item.get('manager_timeout_seconds', 172800)),
            'hr_timeout_seconds': int(config_item.get('hr_timeout_seconds', 172800))
        }

        if STATE_MACHINE_ARN:
            sfn_response = sfn_client.start_execution(
                stateMachineArn=STATE_MACHINE_ARN,
                name=request_id,
                input=json.dumps(sfn_input)
            )
            request_item['step_functions_execution_arn'] = sfn_response['executionArn']
            
        leave_requests_table.put_item(Item=request_item)
        
        # Additional features as requested for SNS, SES, and Secrets Manager integration
        token_secret = get_approval_token_secret()
        if SNS_TOPIC_ARN:
            publish_sns_message(employee_id, manager_id, SNS_TOPIC_ARN)

        # Notify via email if needed
        try:
            to_addresses = ['boseayan500@gmail.com', employee_id]
            ses_client.send_email(
                Source=SENDER_EMAIL,
                Destination={'ToAddresses': to_addresses},
                Message={
                    'Subject': {'Data': 'Leave Request Submitted'},
                    'Body': {'Text': {'Data': f"Leave request for {employee_id} has been submitted to manager {manager_id}."}}
                }
            )
        except Exception as e:
            print(f"Error sending SES email: {e}")

        return {'statusCode': 201, 'body': json.dumps({'message': 'Request submitted', 'request_id': request_id})}

    except Exception as e:
        print(f"Error: {e}")
        return {'statusCode': 500, 'body': json.dumps({'message': 'Internal Server Error'})}
