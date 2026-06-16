import { useState, useRef, useCallback, useEffect } from 'react';
import { creditsApi } from '@/api/client';
import { useStore } from '@/stores';
import type { VideoTask } from '@/types';

interface VideoPlayerModalProps {
  video: VideoTask;
  onClose: () => void;
  onRewardClaimed: () => void;
}

export default function VideoPlayerModal({
  video,
  onClose,
  onRewardClaimed,
}: VideoPlayerModalProps) {
  const { addToast, setCreditsBalance } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const minWatchSeconds = Math.min(30, video.duration_seconds);
  const canClaim = watchedSeconds >= minWatchSeconds && !claimed;
  const remainingSeconds = Math.max(0, minWatchSeconds - watchedSeconds);

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  // ── 全屏变化监听 ──
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    const onFsError = () => setIsFullscreen(false);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('fullscreenerror', onFsError);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('fullscreenerror', onFsError);
    };
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.seeking || isDragging) return;
    const t = Math.floor(v.currentTime);
    setWatchedSeconds(t);
    setProgress(v.duration ? v.currentTime / v.duration : 0);
  }, [isDragging]);

  const handleSeeked = useCallback(() => {
    if (videoRef.current && videoRef.current.currentTime > watchedSeconds + 2) {
      videoRef.current.currentTime = watchedSeconds;
    }
  }, [watchedSeconds]);

  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlaying]);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    startHideTimer();
  }, [startHideTimer]);

  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      if (watchedSeconds === 0) {
        setShowHint(true);
        setTimeout(() => setShowHint(false), 3000);
      }
    } else {
      v.pause();
    }
  }, [watchedSeconds]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  // ── 全屏切换 ──
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current) {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
    }
  }, []);

  // ── 双击视频切换全屏 ──
  const handleVideoDblClick = useCallback(() => {
    toggleFullscreen();
  }, [toggleFullscreen]);

  // ── 进度条拖拽 ──
  const handleProgressPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setIsDragging(true);
      const rect = e.currentTarget.getBoundingClientRect();
      const updateFromPointer = (pe: PointerEvent) => {
        const v = videoRef.current;
        if (!v) return;
        const x = Math.max(0, Math.min(pe.clientX - rect.left, rect.width));
        const ratio = x / rect.width;
        const targetTime = ratio * v.duration;
        if (targetTime <= watchedSeconds + 1) {
          v.currentTime = targetTime;
          setProgress(ratio);
        }
      };
      const cleanup = () => {
        setIsDragging(false);
        window.removeEventListener('pointermove', updateFromPointer);
        window.removeEventListener('pointerup', cleanup);
      };
      window.addEventListener('pointermove', updateFromPointer);
      window.addEventListener('pointerup', cleanup);
      const v = videoRef.current;
      if (!v) return;
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const ratio = x / rect.width;
      const targetTime = ratio * v.duration;
      if (targetTime <= watchedSeconds + 1) {
        v.currentTime = targetTime;
        setProgress(ratio);
      }
    },
    [watchedSeconds],
  );

  const handleClaim = async () => {
    if (claiming || claimed) return;
    setClaiming(true);
    try {
      const result = await creditsApi.watchVideo(video.id, watchedSeconds);
      if (result.success) {
        setClaimed(true);
        setCreditsBalance(result.balance);
        addToast(`+${result.earned} 积分（今日第${result.daily_count}次）`, 'success');
        onRewardClaimed();
      }
    } catch (err: any) {
      addToast(err.message || '领取失败，请重试', 'error');
    } finally {
      setClaiming(false);
    }
  };

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !document.fullscreenElement) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const controlsVisible = showControls || !isPlaying || isDragging;

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-500 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleBackdropClick}
      style={{
        // 完全透明遮罩，只用来拦截点击关闭
        backgroundColor: 'transparent',
        cursor: 'default',
      }}
    >
      {/* ── 居中容器 ── */}
      <div
        className="flex h-full w-full items-center justify-center select-none"
        style={{ padding: isFullscreen ? '0' : '20px' }}
      >
        {/* ── 视频窗口 ── */}
        <div
          ref={containerRef}
          className="relative"
          style={{
            width: isFullscreen ? '100%' : 'min(calc(100vw - 40px), 1280px)',
            height: isFullscreen ? '100%' : 'auto',
            maxWidth: '100%',
            maxHeight: isFullscreen ? '100%' : '90vh',
            borderRadius: isFullscreen ? '0' : 'var(--radius-xl)',
            overflow: 'hidden',
            backgroundColor: '#000',
            boxShadow: isFullscreen
              ? 'none'
              : '0 30px 80px rgba(0,0,0,0.45), 0 10px 25px rgba(0,0,0,0.25)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={handleMouseMove}
        >
          {/* ── 视频 ── */}
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              className="block cursor-pointer"
              style={{
                width: '100%',
                height: isFullscreen ? '100%' : 'auto',
                aspectRatio: isFullscreen ? 'auto' : '16 / 9',
                objectFit: isFullscreen ? 'contain' : 'contain',
                backgroundColor: '#000',
                display: 'block',
              }}
              src={`/api/videos/play/${video.id}`}
              playsInline
              disablePictureInPicture
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleSeeked}
              onContextMenu={(e) => e.preventDefault()}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setShowControls(true);
              }}
              onClick={togglePlay}
              onDoubleClick={handleVideoDblClick}
              preload="auto"
            />

            {/* ── 中心播放按钮 ── */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="group absolute inset-0 flex cursor-pointer items-center justify-center outline-none active:scale-90 transition-transform duration-100"
                style={{ zIndex: 10 }}
              >
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full shadow-2xl transition-all duration-300 group-hover:scale-110 sm:h-24 sm:w-24"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  <svg
                    className="ml-1 h-8 w-8 sm:h-10 sm:w-10 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </button>
            )}

            {/* ── 顶部栏 ── */}
            <div
              className={`absolute inset-x-0 top-0 pb-14 pt-3 transition-opacity duration-300 ${
                controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)',
                zIndex: 10,
              }}
            >
              <div className="flex items-center justify-between px-4 sm:px-5">
                <h2 className="truncate text-sm font-semibold text-white/90 drop-shadow sm:text-base">
                  {video.title}
                </h2>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 backdrop-blur transition-all duration-200 active:scale-90 hover:bg-white/20"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <svg
                    className="h-[16px] w-[16px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── 底部控制栏 ── */}
            <div
              className={`absolute inset-x-0 bottom-0 pt-16 pb-2 sm:pb-3 transition-all duration-300 ${
                controlsVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-3 pointer-events-none'
              }`}
              style={{
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)',
                zIndex: 10,
              }}
            >
              {showHint && (
                <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/60 backdrop-blur">
                  鼠标悬停显示控制栏 · 双击全屏
                </div>
              )}

              {/* 进度条 */}
              <div className="px-4 pb-2 sm:px-5 sm:pb-2.5">
                <div
                  className="group/progress relative cursor-pointer rounded-full transition-all hover:h-[5px]"
                  style={{
                    height: '4px',
                    backgroundColor: 'rgba(255,255,255,0.15)',
                  }}
                  onPointerDown={handleProgressPointerDown}
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${progress * 100}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 rounded-full opacity-0 shadow-lg transition-all duration-150 group-hover/progress:opacity-100"
                    style={{
                      width: '14px',
                      height: '14px',
                      backgroundColor: 'var(--accent)',
                      left: `calc(${progress * 100}% - 7px)`,
                      boxShadow: '0 0 0 2px rgba(255,255,255,0.3)',
                    }}
                  />
                </div>
              </div>

              {/* 按钮行 */}
              <div className="flex items-center justify-between px-4 sm:px-5">
                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  {/* 播放/暂停 */}
                  <button
                    onClick={togglePlay}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white active:scale-90 transition-all duration-150"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {isPlaying ? (
                      <svg className="h-[15px] w-[15px]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg
                        className="ml-0.5 h-[15px] w-[15px]"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* 静音 */}
                  <button
                    onClick={toggleMute}
                    className="flex h-8 w-8 items-center justify-center rounded-full active:scale-90 transition-all duration-150"
                    style={{ color: isMuted ? '#f3727f' : 'rgba(255,255,255,0.6)' }}
                  >
                    {isMuted ? (
                      <svg
                        className="h-[15px] w-[15px]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-[15px] w-[15px]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                        />
                      </svg>
                    )}
                  </button>

                  {/* 时间 */}
                  <span className="select-none tabular-nums text-[12px] font-medium text-white/55">
                    {formatTime(watchedSeconds)}
                    <span className="mx-0.5 opacity-40">/</span>
                    {formatTime(video.duration_seconds)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-3">
                  {/* 全屏按钮 */}
                  <button
                    onClick={toggleFullscreen}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 active:scale-90 transition-all duration-150 hover:text-white/90"
                    title={isFullscreen ? '退出全屏' : '全屏'}
                  >
                    <svg
                      className="h-[17px] w-[17px]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      {isFullscreen ? (
                        <>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 3v3a2 2 0 01-2 2H3"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 8h-3a2 2 0 01-2-2V3"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16h3a2 2 0 012 2v3"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16 21v-3a2 2 0 012-2h3"
                          />
                        </>
                      ) : (
                        <>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 3H5a2 2 0 00-2 2v3"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 8V5a2 2 0 00-2-2h-3"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16 21h3a2 2 0 002-2v-3"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16v3a2 2 0 002 2h3"
                          />
                        </>
                      )}
                    </svg>
                  </button>

                  {/* 领取积分 */}
                  {!claimed && !canClaim && (
                    <span className="hidden sm:inline select-none text-[11px] text-white/35">
                      {isPlaying && remainingSeconds > 0
                        ? `还需 ${remainingSeconds}s`
                        : `看 ${minWatchSeconds}s 领奖`}
                    </span>
                  )}

                  {claimed ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 backdrop-blur">
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      已领取
                    </span>
                  ) : canClaim ? (
                    <button
                      onClick={handleClaim}
                      disabled={claiming}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-all duration-200 active:scale-90 disabled:opacity-50 sm:px-5 sm:text-sm"
                      style={{ backgroundColor: 'var(--accent)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--accent)';
                      }}
                    >
                      {claiming ? '领取中...' : `+${video.reward} 领取`}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
