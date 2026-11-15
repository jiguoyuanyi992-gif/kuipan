import type { ContractType } from "../types";

export interface ExampleContract {
  id: string;
  label: string;
  type: ContractType;
  // 全部为编造内容，页面须标注「示例，虚构」。
  fabricated: true;
  text: string;
}

const rent = `房屋租赁合同（示例，虚构）

甲方（出租方）：张三
乙方（承租方）：李四
身份证号：110101199003077758
联系电话：13800138000
房屋坐落：北京市朝阳区示例路1号

第一条 租赁期限
租期12个月，自2026年1月1日起至2026年12月31日止。

第二条 租金与押金
月租金为人民币3000元，押金9000元。乙方应于每月5日前支付当月租金。

第三条 押金退还
乙方退租时，甲方退还押金；但乙方提前退租的，押金不予退还。

第四条 违约责任
乙方违约的，违约金6000元，相当于两个月租金。

第五条 合同解除
甲方如需提前收回房屋，应提前30日通知乙方。

甲方（签字）：张三
乙方（签字）：李四
`;

const intern = `实习协议（示例，虚构）

甲方（用人单位）：示例单位
乙方（实习生）：王五
联系电话：13900139000

第一条 实习期限
实习期3个月，自2026年7月1日起。

第二条 实习报酬
试用期无薪，转正后每月工资2000元。

第三条 协议解除
用人单位可随时解除本协议，乙方需提前30日申请。

甲方（盖章）：示例单位
乙方（签字）：王五
`;

const clean = `技术服务协议（示例，虚构）

甲方：示例单位
乙方：赵六

第一条 服务内容
乙方为甲方提供网站维护服务，每月服务费1000元。

第二条 服务期限
服务期限6个月，自2026年1月1日起。

第三条 费用支付
甲方应于每月10日前支付当月服务费。

第四条 争议解决
双方协商解决争议。

甲方（签字）：示例单位
乙方（签字）：赵六
`;

export const examples: ExampleContract[] = [
  { id: "ex-rent", label: "租房合同示例", type: "rent", fabricated: true, text: rent },
  { id: "ex-intern", label: "实习协议示例", type: "internship", fabricated: true, text: intern },
  { id: "ex-clean", label: "通用协议示例", type: "other", fabricated: true, text: clean },
];

export function exampleById(id: string): ExampleContract | undefined {
  return examples.find((e) => e.id === id);
}