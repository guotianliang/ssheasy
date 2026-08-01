/** 操作日志条目（与后端 OperationLog 对应） */
export interface OperationLog {
  id: number;
  serverId: string;
  command: string;
  /** 风险等级：low | medium | high */
  riskLevel: string;
  executedAt: string;
}
