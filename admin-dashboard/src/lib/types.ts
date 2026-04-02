export interface User {
  id: string
  telegram_id: number
  telegram_username?: string
  first_name?: string
  created_at: string
  receipt_count?: number
  last_active?: string
}

export interface Receipt {
  id: string
  user_id: string
  job_id?: string
  amount: number
  vendor?: string
  receipt_date: string
  category: string
  description?: string
  created_at: string
  user?: {
    first_name?: string
    telegram_username?: string
  }
  job?: {
    name: string
  }
  jobs?: {
    name: string
  }
}

export interface Job {
  id: string
  user_id: string
  name: string
  client?: string
  status: string
  created_at: string
}

export interface Analytics {
  totalUsers: number
  totalReceipts: number
  receiptsToday: number
  receiptsThisWeek: number
  receiptsThisMonth: number
  dailyActiveUsers: number
  avgReceiptsPerUser: number
  topCategories: Array<{
    category: string
    count: number
    total_amount: number
  }>
}