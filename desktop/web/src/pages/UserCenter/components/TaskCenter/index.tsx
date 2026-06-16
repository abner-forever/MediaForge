import { useState, useEffect, useCallback } from 'react';
import { creditsApi } from '@/api/client';
import { useStore } from '@/stores';
import type { VideoTask, DailyTask } from '@/types';
import TaskCard from './TaskCard';
import VideoPlayerModal from './VideoPlayerModal';

export default function TaskCenter() {
  const { dailyTasks, setDailyTasks, creditsBalance, setCreditsBalance } = useStore();
  const [videos, setVideos] = useState<VideoTask[]>([]);
  const [playingVideo, setPlayingVideo] = useState<VideoTask | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);

  const [todayEarned, setTodayEarned] = useState(0);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const result = await creditsApi.getTasks();
      setDailyTasks(result.tasks);
      setTodayEarned(result.today_earned);
    } catch {
      // silent
    } finally {
      setTasksLoading(false);
    }
  }, [setDailyTasks]);

  const loadVideos = useCallback(async () => {
    setVideoLoading(true);
    try {
      const result = await creditsApi.getVideoList();
      setVideos(result.videos);
    } catch {
      setVideos([]);
    } finally {
      setVideoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadVideos();
  }, [loadTasks, loadVideos]);

  const handleRewardClaimed = () => {
    loadTasks();
  };

  // todayEarned is set from API response

  return (
    <div className="space-y-10">
      {/* ── 今日概览 ── */}
      <div>
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-text tracking-tight">今日任务</h2>
            <p className="text-sm text-text-secondary mt-0.5">完成任务赚取积分</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-text-muted">今日已赚</div>
            <div className="text-lg font-bold text-accent">+{todayEarned}</div>
          </div>
        </div>

        {tasksLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : dailyTasks.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">暂无任务</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {dailyTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* ── 分隔线 ── */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-bg px-4 text-xs font-medium text-text-muted">视频列表</span>
        </div>
      </div>

      {/* ── 视频列表（Apple 风格网格） ── */}
      <div>
        <div className="mb-5">
          <h2 className="text-xl font-bold text-text tracking-tight">观看视频赚积分</h2>
          <p className="text-sm text-text-secondary mt-0.5">选择视频观看，看完后领取积分奖励</p>
        </div>

        {videoLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-2xl border border-border border-dashed py-16 text-center">
            <p className="text-sm text-text-muted">暂无视频内容，请稍后再来</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <button
                key={video.id}
                onClick={() => setPlayingVideo(video)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:translate-y-0"
              >
                {/* 视频封面 */}
                <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-accent/30 to-accent/5">
                  {/* 播放图标 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-all duration-300 group-hover:bg-white/30 group-hover:scale-110">
                      <svg
                        className="ml-0.5 h-6 w-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>

                  {/* 时长标签 */}
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur">
                    {video.duration_seconds}″
                  </span>

                  {/* 顶部渐变 */}
                  <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/30 to-transparent" />

                  {/* 奖励标签 */}
                  <div className="absolute left-3 top-3 rounded-full bg-accent/80 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                    +{video.reward}
                  </div>
                </div>

                {/* 视频信息 */}
                <div className="flex flex-col gap-1.5 px-4 py-3.5">
                  <h3 className="text-sm font-semibold text-text truncate group-hover:text-accent transition-colors">
                    {video.title}
                  </h3>
                  <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                    {video.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 积分提示（Apple 风格的简洁提醒） ── */}
      <div className="rounded-2xl border border-border/50 bg-gradient-to-br  p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm">
            💡
          </div>
          <div className="text-xs leading-relaxed text-text-secondary">
            <span className="font-medium text-text">小贴士：</span>
            每天观看最多可获得 <span className="text-accent font-medium">30</span> 积分，
            连续签到奖励更丰厚。积分可用于 <span className="text-accent font-medium">AI 写作</span>
            、<span className="text-accent font-medium">封面选取</span>、联网搜索等高级功能。
          </div>
        </div>
      </div>

      {/* 视频播放弹窗 */}
      {playingVideo && (
        <VideoPlayerModal
          video={playingVideo}
          onClose={() => setPlayingVideo(null)}
          onRewardClaimed={handleRewardClaimed}
        />
      )}
    </div>
  );
}
