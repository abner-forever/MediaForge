/**
 * 积分明细列表
 * 显示积分交易记录，支持分页加载
 */

import type { CreditTransaction } from '@/types'

const SOURCE_LABELS: Record<string, string> = {
  gift: '系统赠送',
  checkin: '每日签到',
  publish: '发布文章',
  ad_watch: '观看广告',
  invite: '邀请好友',
  task: '完成任务',
  purchase: '购买积分',
}

interface TransactionListProps {
  transactions: CreditTransaction[]
  txTotal: number
  txLoading: boolean
  onLoadMore: () => void
}

export default function TransactionList({ transactions, txTotal, txLoading, onLoadMore }: TransactionListProps) {
  return (
    <div className="card p-5 max-h-[480px] overflow-auto">
      <div className="section-header">积分明细</div>

      {transactions.length === 0 && !txLoading && (
        <div className="text-center py-6 text-text-muted text-xs">
          暂无积分记录
        </div>
      )}

      <div className="flex flex-col">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text font-medium">
                {tx.description || SOURCE_LABELS[tx.source] || tx.source}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">
                {new Date(tx.created_at).toLocaleString()}
              </div>
            </div>
            <div className={`text-[13px] font-semibold whitespace-nowrap ml-3 ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
              {tx.amount > 0 ? '+' : ''}{tx.amount}
            </div>
          </div>
        ))}
      </div>

      {transactions.length < txTotal && (
        <button
          onClick={onLoadMore}
          disabled={txLoading}
          className="btn btn-sm w-full mt-2"
        >
          {txLoading ? '加载中…' : '加载更多'}
        </button>
      )}
    </div>
  )
}
