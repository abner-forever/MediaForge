/* ── API Client ─────────────────────────────── */
// 各 API 模块已拆分至独立文件，此处通过 re-export 保持向后兼容

export { request, toUserError } from './base';

export type {
  HealthStatus, DashboardStats, RunInfo, OperationItem, OperationsResponse,
  Post, ScoreInfo, DiscoveryResult, DownloadStreamEvent, SearchStreamEvent,
  MaterialsGroup, MaterialsData, TreeNode, BrowseFolder, BrowseFile, BrowseResult, TreeResult,
  MaterialMeta, MaterialsTagsResponse, MetadataResponse, CoverImage,
  QueueItem, PublishLogsResponse,
  ArticleItem, ChatMessage, InspirationTopic, ArticleListResponse, ArticleResponse, ArticleContentResponse,
  TitleCandidate, InspirationResponse,
  SettingsData, PlatformMeta, LogFileInfo, LogContentResponse,
  WeChatAccount, WeChatLoginEvent, PublishHistoryItem,
  PipelineConfig, PipelineEvent, PipelineSummary,
  DuplicateCheckResult,
  PublishEffect, EffectSummary, EffectTrendPoint, EffectCompareItem, EffectCompareData, MpArticlesResponse,
  WeiboLoginEvent, WeiboVerifyResult, ToutiaoLoginEvent, ToutiaoVerifyResult,
} from '../types';

export { platformApi } from './platform';
export { wechatAccountApi } from './wechat';
export { dashboardApi } from './dashboard';
export { logsApi } from './logs';
export { settingsApi } from './settings';
export { discoveryApi, downloadStream, searchStream } from './discovery';
export { selectionApi } from './selection';
export { materialsApi } from './materials';
export { publishLogsApi } from './publishLogs';
export { queueApi } from './queue';
export { articleApi } from './articles';
export { complianceApi } from './compliance';
export { effectsApi } from './effects';
export { pipelineApi } from './pipeline';
