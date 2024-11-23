import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as events from "aws-cdk-lib/aws-events";
import * as event_targets from "aws-cdk-lib/aws-events-targets";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";

export interface ScheduledEventBridgeEventProps {
  crontString: string;
  stateMachine: stepfunctions.StateMachine;
}

export class ScheduledEventBridgeEvent extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: ScheduledEventBridgeEventProps
  ) {
    super(scope, id);

    const eventRule = new events.Rule(this, "EventRule", {
      schedule: events.Schedule.expression(`cron(${props.crontString})`),
    });
    eventRule.addTarget(new event_targets.SfnStateMachine(props.stateMachine));
  }
}
