export interface PathBookmark {
  id: string;
  serverId: string;
  path: string;
  label?: string;
  sortOrder: number;
  createdAt: string;
}

export interface PathBookmarkInput {
  serverId: string;
  path: string;
  label?: string;
}
