export interface ProviderInfo {
  name: string;
  models: string[];
  baseUrl: string;
  keyName: string;
  urlHint: string;
  guideUrl: string;
  guide: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  mimo: {
    name: '小米 MiMo',
    models: ['mimo-chat', 'mimo-v2.5-pro'],
    baseUrl: 'https://api.xiaomimimo.com/v1',
    keyName: 'MIMO_API_KEY',
    urlHint: '小米 Mimo OpenAI 兼容地址，格式：https://api.xiaomimimo.com/v1',
    guideUrl: 'https://xiaomimimo.com/',
    guide: '登录小米 MiMo 官网 → 控制台 → API 密钥 → 创建 API Key',
  },
  deepseek: {
    name: 'DeepSeek',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    baseUrl: 'https://api.deepseek.com/v1',
    keyName: 'DEEPSEEK_API_KEY',
    urlHint: 'DeepSeek API 地址，格式：https://api.deepseek.com/v1',
    guideUrl: 'https://platform.deepseek.com/api_keys',
    guide: '登录 DeepSeek 开放平台 → API Keys → 创建 API Key → 复制密钥',
  },
  openai: {
    name: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
    baseUrl: 'https://api.openai.com/v1',
    keyName: 'OPENAI_API_KEY',
    urlHint: 'OpenAI API 地址，格式：https://api.openai.com/v1',
    guideUrl: 'https://platform.openai.com/api-keys',
    guide: '登录 OpenAI 平台 → API → API Keys → 创建密钥',
  },
  glm: {
    name: '智谱 GLM',
    models: ['GLM-5.1', 'GLM-5', 'GLM-5-Turbo', 'GLM-4.7', 'GLM-4.7-Flash', 'GLM-4.6', 'GLM-4.5-Air', 'GLM-4-Long'],
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyName: 'GLM_API_KEY',
    urlHint: '智谱 API 地址，格式：https://open.bigmodel.cn/api/paas/v4',
    guideUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    guide: '登录智谱 AI 开放平台 → API 密钥 → 创建 API Key',
  },
  qwen: {
    name: '千问 Qwen',
    models: ['qwen3.6-max-preview', 'qwen3.5-max', 'qwen3.5-plus', 'qwen3.5-flash', 'qwen3-max-thinking', 'qwen3-max', 'qwen3-plus', 'qwen3-flash'],
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyName: 'QWEN_API_KEY',
    urlHint: '阿里云 DashScope 兼容地址，格式：https://dashscope.aliyuncs.com/compatible-mode/v1',
    guideUrl: 'https://bailian.console.aliyun.com/',
    guide: '登录阿里云百炼控制台 → 模型广场 → API Key 管理 → 创建密钥',
  },
  minimax: {
    name: 'MiniMax',
    models: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2'],
    baseUrl: 'https://api.minimaxi.com/v1',
    keyName: 'MINIMAX_API_KEY',
    urlHint: 'MiniMax API 地址，格式：https://api.minimaxi.com/v1',
    guideUrl: 'https://platform.minimaxi.com/',
    guide: '登录 MiniMax 开放平台 → 接口密钥 → 创建 API Key',
  },
};
