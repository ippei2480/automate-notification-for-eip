import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

export const handler = async (event: any): Promise<any> => {
  console.log("event: ", JSON.stringify(event));
  const chatbotTopicARN = process.env.TOPIC_ARN!;

  const byAccountResult = event.ByAccountResult;
  const byAccountTable = arrayToTable(byAccountResult);

  let notAssociatedResult;
  if (event.NotAssociatedResult.Results.length > 0) {
    notAssociatedResult = event.NotAssociatedResult.Results.map((item: any) => {
      item = JSON.parse(item);
      return {
        accountId: item.accountId,
        region: item.awsRegion,
        publicIp: item.configuration.publicIp,
      };
    });
  }

  const notAssociatedTable = notAssociatedResult
    ? arrayToTable(notAssociatedResult)
    : "なし";
  // console.log(byAccountTable);
  // console.log(notAssociatedTable);
  let content = `
    Elastic IP通知

    ・アカウントごとのEIP数
    ${byAccountTable}

    ・関連付けされていないEIPリスト
    ${notAssociatedTable}
    `;

  content = `{
        "version": "1.0",
        "source": "custom",
        "content": {
            "description": "${content.replace(/\r?\n/g, "\\n")}"
        }
    }`;
  console.log(content);

  const snsClient = new SNSClient({});
  const publishResponse = await snsClient.send(
    new PublishCommand({
      Message: content,
      TopicArn: chatbotTopicARN,
    })
  );
  console.log("publishResponse: ", JSON.stringify(publishResponse));

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Success" }),
  };
};

const arrayToTable = (array: any[]) => {
  var table = "";
  var separator = "---";

  // column list
  var cols = Object.keys(array[0]);

  // table headers
  table += cols.join(" | ");
  table += "\r\n";

  // table header seperator
  table += cols
    .map(function () {
      return separator;
    })
    .join(" | ");
  table += "\r\n";

  // table body
  array.forEach(function (item) {
    table +=
      cols
        .map(function (key) {
          return String(item[key] || "");
        })
        .join(" | ") + "\r\n";
  });

  return table;
};
