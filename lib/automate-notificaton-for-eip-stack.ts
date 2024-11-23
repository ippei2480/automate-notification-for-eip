import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import { AppParameter } from "../parameters";
import { EIPNotification } from "./constructs/EIPNotification";
import { ScheduledEventBridgeEvent } from "./constructs/ScheduledEventBridgeEvent";

export interface AutomateNotificatonForEipStackProps extends cdk.StackProps {
  parameters: AppParameter;
}

export class AutomateNotificatonForEipStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: AutomateNotificatonForEipStackProps
  ) {
    super(scope, id, props);

    // Cahtbot通知用SNSトピック
    const chatbotTopic = new sns.Topic(this, "ChatBotTopic");

    // メイン処理のStepFunctions StateMachine
    const eipNotification = new EIPNotification(this, "EIPNotification", {
      chatbotTopic: chatbotTopic,
      configurationAggregatorName: props.parameters.configurationAggregatorName,
    });

    // スケジュールEventBridge
    const scheduldeEventBridgeEvent = new ScheduledEventBridgeEvent(
      this,
      "Event",
      {
        crontString: props.parameters.scheduleCronString,
        stateMachine: eipNotification.stateMachine,
      }
    );
  }
}
