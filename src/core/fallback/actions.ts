import type { ContractType } from "../types";

// 无法律依据可展示时的固定行动建议（纯数据，不含 React）。
export const GENERAL_ACTIONS: string[] = [
  "先别当场签字或付款。",
  "请对方把这条的意思书面解释清楚，最好写进合同。",
  "合同原件、聊天记录、付款凭证拍照留存。",
  "消费类纠纷可拨 12315。",
  "法律问题可拨 12348 公共法律服务热线。",
];

export const SCENE_EXTRA_ACTIONS: Partial<Record<ContractType, string[]>> = {
  rent: ["可以咨询当地 12345 政务服务热线。"],
  internship: ["可以先问学校实习指导老师。", "劳动权益问题可拨 12333。"],
  insurance: ["保险消费纠纷可拨 12378 银行保险消费者投诉维权热线。"],
};

export function actionsForType(type: ContractType): string[] {
  const extra = SCENE_EXTRA_ACTIONS[type] ?? [];
  return [...GENERAL_ACTIONS, ...extra];
}