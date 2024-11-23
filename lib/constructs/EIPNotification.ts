import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";
import * as stepfunctions_tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as sns from "aws-cdk-lib/aws-sns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node_lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";

export interface EIPNotificationProps {
  chatbotTopic: sns.Topic;
  configurationAggregatorName: string;
}

export class EIPNotification extends Construct {
  readonly stateMachine: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props: EIPNotificationProps) {
    super(scope, id);
    const { accountId, region } = new cdk.ScopedAws(this);

    // task設定
    // アカウントごとのEIPリストを取得
    const getTheNumberOfEIPsByAccounts = new stepfunctions_tasks.CallAwsService(
      this,
      "ByAccount",
      {
        service: "config",
        action: "selectAggregateResourceConfig",
        iamResources: [`*`],
        parameters: {
          ConfigurationAggregatorName: props.configurationAggregatorName,
          Expression:
            "SELECT accountId, COUNT(*) WHERE (resourceType = 'AWS::EC2::EIP') GROUP BY accountId;",
        },
        resultPath: "$.ByAccountResult",
      }
    );

    const stringToJson = new stepfunctions.Pass(this, "StringToJson", {
      parameters: {
        "AccountDetails.$": "States.StringToJson($)",
      },
    });

    const getAccountName = new stepfunctions_tasks.CallAwsService(
      this,
      "DescribeAccount",
      {
        service: "organizations",
        action: "describeAccount",
        iamResources: [`*`],
        parameters: {
          AccountId: stepfunctions.JsonPath.stringAt(
            "$.AccountDetails.accountId"
          ),
        },
        resultSelector: {
          "accountName.$": "$.Account.Name",
        },
        resultPath: "$.AccountName",
      }
    );

    const formatJson = new stepfunctions.Pass(this, "FormatJson", {
      parameters: {
        "AccountId.$": "$.AccountDetails.accountId",
        "AccountName.$": "$.AccountName.accountName",
        "EIPCount.$": "$.AccountDetails.COUNT(*)",
      },
    });

    const mapDefinition = stringToJson.next(getAccountName).next(formatJson);

    const getAccountNameMap = new stepfunctions.Map(this, "GetAccountNameMap", {
      maxConcurrency: 10,
      inputPath: "$.ByAccountResult.Results",
    }).itemProcessor(mapDefinition);

    const storeResults = new stepfunctions.Pass(this, "StoreResults", {
      parameters: {
        "ByAccountResult.$": "$",
      },
    });

    // ENIと関連付けられてないEIPリストを取得
    const getNotAssociatedEIPs = new stepfunctions_tasks.CallAwsService(
      this,
      "NotAssociated",
      {
        service: "config",
        action: "selectAggregateResourceConfig",
        iamResources: [`*`],
        parameters: {
          ConfigurationAggregatorName: props.configurationAggregatorName,
          Expression:
            "SELECT accountId, awsRegion, configuration.publicIp WHERE (resourceType = 'AWS::EC2::EIP' AND relationships.resourceId NOT LIKE 'eni%') ORDER BY accountId;",
        },
        resultPath: "$.NotAssociatedResult",
        outputPath: "$['ByAccountResult', 'NotAssociatedResult']",
      }
    );

    // lambda
    const fncRole = new iam.Role(this, "FncRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });
    fncRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sns:Publish"],
        resources: [props.chatbotTopic.topicArn],
      })
    );

    const fncPublishToSns = new node_lambda.NodejsFunction(
      this,
      "FncPublishToSns",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 128,
        timeout: cdk.Duration.seconds(15),
        role: fncRole,
        entry: "./lambda/publishToSns.ts",
        handler: "handler",
        environment: {
          TOPIC_ARN: props.chatbotTopic.topicArn,
        },
      }
    );

    // lambdaコール
    const publishToSns = new stepfunctions_tasks.LambdaInvoke(
      this,
      "PublishToSns",
      {
        lambdaFunction: fncPublishToSns,
        payload: stepfunctions.TaskInput.fromObject({
          "ByAccountResult.$": "$.ByAccountResult",
          "NotAssociatedResult.$": "$.NotAssociatedResult",
        }),
      }
    );

    // statemachine definition 設定

    // statemachine role
    const stateMachineRole = new iam.Role(this, "StateMachineRole", {
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
    });
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["config:SelectAggregateResourceConfig"],
        resources: ["*"],
      })
    );
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["organizations:DescribeAccount"],
        resources: ["*"],
      })
    );

    /*
    const logGroup = new logs.LogGroup(this, "LogGroup", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    */

    // statemachine定義
    const definition = getTheNumberOfEIPsByAccounts
      .next(getAccountNameMap)
      .next(storeResults)
      .next(getNotAssociatedEIPs)
      .next(publishToSns);

    // statemachine 本体
    const stateMachine = new stepfunctions.StateMachine(this, "StateMachine", {
      // stateMachineType: stepfunctions.StateMachineType.EXPRESS,
      role: stateMachineRole,
      definitionBody: stepfunctions.DefinitionBody.fromChainable(definition),
      /*
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
      },
      */
    });
    this.stateMachine = stateMachine;
  }
}
