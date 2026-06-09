/**
 * 云同步配置卡片
 */

import { useState, useEffect } from 'react'
import { syncApi } from '../../api/sync'
import type { SyncStatus } from '../../types'

interface Props {
  onStatusChange?: (status: SyncStatus) => void
}

export default function CloudSyncCard({ onStatusChange }: Props) {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [testing, setTesting] = useState(false)

  // 加载同步状态
  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const data = await syncApi.getStatus()
      setStatus(data)
      onStatusChange?.(data)
    } catch (err) {
      console.error('加载同步状态失败:', err)
    }
  }

  // 配置同步
  const handleConfigure = async () => {
    if (!serverUrl || !secret) {
      setError('请填写服务器地址和密钥')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await syncApi.configure({
        server_url: serverUrl,
        secret: secret
      })

      if (result.success) {
        setSuccess(result.message)
        setShowConfig(false)
        setServerUrl('')
        setSecret('')
        await loadStatus()
      } else {
        setError(result.message)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '配置失败')
    } finally {
      setLoading(false)
    }
  }

  // 禁用同步
  const handleDisable = async () => {
    if (!confirm('确定要禁用云同步吗？禁用后将停止自动同步积分数据。')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await syncApi.disable()
      setSuccess('云同步已禁用')
      await loadStatus()
    } catch (err: any) {
      setError(err.response?.data?.detail || '禁用失败')
    } finally {
      setLoading(false)
    }
  }

  // 测试连接
  const handleTest = async () => {
    setTesting(true)
    setError(null)

    try {
      const result = await syncApi.testConnection()
      if (result.success) {
        setSuccess(result.message)
      } else {
        setError(result.message)
      }
    } catch (err: any) {
      setError('测试失败')
    } finally {
      setTesting(false)
    }
  }

  // 手动同步
  const handleManualSync = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await syncApi.manualSync()
      if (result.success) {
        setSuccess(result.message)
        await loadStatus()
      } else {
        setError(result.message)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '同步失败')
    } finally {
      setLoading(false)
    }
  }

  // 从云端加载
  const handleLoadFromCloud = async () => {
    if (!confirm('确定要从云端加载数据吗？这将覆盖本地积分数据！')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await syncApi.loadFromCloud()
      if (result.success) {
        setSuccess(`${result.message}，当前余额: ${result.balance}`)
        await loadStatus()
      } else {
        setError(result.message)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 格式化时间
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '从未同步'
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN')
  }

  if (!status) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">云同步</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {status.enabled ? '已启用' : '未启用'}
            </p>
          </div>
        </div>

        {/* 状态指示器 */}
        <div className={`px-3 py-1 rounded-full text-sm ${
          status.enabled
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {status.enabled ? '● 已连接' : '○ 未连接'}
        </div>
      </div>

      {/* 错误/成功消息 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* 同步信息 */}
      {status.enabled && (
        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">服务器</span>
            <span className="text-gray-900 dark:text-white font-mono text-xs">
              {status.server_url}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">设备ID</span>
            <span className="text-gray-900 dark:text-white font-mono text-xs">
              {status.device_id || '-'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">上次同步</span>
            <span className="text-gray-900 dark:text-white">
              {formatTime(status.last_sync)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">自动同步</span>
            <span className="text-gray-900 dark:text-white">
              {status.auto_sync ? `每 ${status.sync_interval / 60} 分钟` : '已禁用'}
            </span>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="space-y-3">
        {status.enabled ? (
          <>
            <div className="flex gap-2">
              <button
                onClick={handleManualSync}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
              >
                {loading ? '同步中...' : '立即同步'}
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleLoadFromCloud}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20 rounded-lg transition-colors text-sm"
              >
                从云端恢复
              </button>
              <button
                onClick={handleDisable}
                disabled={loading}
                className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm"
              >
                禁用
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
          >
            {showConfig ? '取消' : '配置云同步'}
          </button>
        )}
      </div>

      {/* 配置表单 */}
      {showConfig && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              服务器地址
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://sync.example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              同步密钥
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="输入同步密钥"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>

          <button
            onClick={handleConfigure}
            disabled={loading}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
          >
            {loading ? '配置中...' : '保存并启用'}
          </button>
        </div>
      )}
    </div>
  )
}
