export interface Transaction {
  id: string;
  symbol: string;
  name: string | null;
  assetType: string;
  action: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  account: string | null;
  orderType: string | null;
  executedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
