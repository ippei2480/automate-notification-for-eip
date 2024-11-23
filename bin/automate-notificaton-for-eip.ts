#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AutomateNotificatonForEipStack } from "../lib/automate-notificaton-for-eip-stack";
import { appParameter } from "../parameters";

const app = new cdk.App();
new AutomateNotificatonForEipStack(app, "AutomateNotificatonForEipStack", {
  env: appParameter.env,
  parameters: appParameter,
});
