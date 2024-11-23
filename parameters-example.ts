export interface AppParameter {
  env: {
    account: string;
    region: string;
  };
  scheduleCronString: string;
  configurationAggregatorName: string;
}

export const appParameter: AppParameter = {
  env: {
    account: "XXXXXXXXXXXX",
    region: "ap-northeast-1",
  },
  scheduleCronString: "30 9 1 * ? *",
  configurationAggregatorName:
    "aws-controltower-GuardrailsComplianceAggregator",
};
