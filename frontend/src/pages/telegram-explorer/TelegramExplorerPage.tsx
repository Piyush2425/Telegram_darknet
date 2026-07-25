import { useMemo, useState, useEffect } from 'react';
import {
  ArrowRight,
  CheckSquare,
  Eye,
  Layers3,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Save,
} from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { useToast } from '@/contexts/ToastContext';
import {
  apiErrorToMessage,
  refreshTelegramEntities,
  deleteTelegramEntity,
  saveTelegramEntitySelection,
  scrapeTelegramEntity,
  startSelectedScraping,
  telegramService,
  type TelegramEntity,
} from '@/services/api';

export function TelegramExplorerPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [banner, setBanner] = useState('Telegram Explorer is ready.');

  const loadEntities = useMemo(
    () => () => telegramService.fetchEntities(search),
    [search],
  );

  const { data, error, isLoading, refetch, setData } = useAsyncQuery(loadEntities, {
    refreshIntervalMs: 30000,
  });

  const entities = data?.entities ?? [];

  // Synchronize local checked selections with backend enabled state
  useEffect(() => {
    if (entities.length > 0) {
      const enabled = entities.filter((entity) => entity.enabled).map((entity) => entity.telegram_id);
      setSelectedIds(enabled);
    }
  }, [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entities;
    return entities.filter((entity) =>
      [entity.title, entity.username, entity.type, entity.monitoring_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [entities, search]);

  async function handleRefresh() {
    setBanner('Refreshing Telegram Explorer...');
    addToast('Contacting Telegram to discover groups and channels...', 'info', 'Discovery Refresh');
    try {
      const response = await refreshTelegramEntities();
      setData({ success: response.success, entities: response.entities ?? [] });
      const count = response.count ?? response.entities?.length ?? 0;
      setBanner(`Refreshed ${count} entities.`);
      addToast(`Discovered and loaded ${count} Telegram groups and channels.`, 'success', 'Discovery Finished');
    } catch (refreshError) {
      const msg = apiErrorToMessage(refreshError);
      setBanner(msg);
      addToast(msg, 'error', 'Discovery Failed');
    }
  }

  function toggleSelection(telegramId: number) {
    setSelectedIds((current) =>
      current.includes(telegramId)
        ? current.filter((value) => value !== telegramId)
        : [...current, telegramId],
    );
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((entity) => selectedIds.includes(entity.telegram_id));

  const handleToggleAll = () => {
    if (allFilteredSelected) {
      const filteredIds = filtered.map((e) => e.telegram_id);
      setSelectedIds((current) => current.filter((id) => !filteredIds.includes(id)));
    } else {
      const filteredIds = filtered.map((e) => e.telegram_id);
      setSelectedIds((current) => Array.from(new Set([...current, ...filteredIds])));
    }
  };

  async function handleSaveSelection() {
    setBanner('Saving selections...');
    setActiveAction('save-selection');
    try {
      const enabledIds = selectedIds;
      const disabledIds = entities
        .map((entity) => entity.telegram_id)
        .filter((telegramId) => !enabledIds.includes(telegramId));
      
      await saveTelegramEntitySelection({ enabled_ids: enabledIds, disabled_ids: disabledIds });
      addToast('Successfully updated monitored channels selection in MongoDB.', 'success', 'Selection Saved');
      setBanner('Selections saved to database.');
      await refetch();
    } catch (saveError) {
      const msg = apiErrorToMessage(saveError);
      setBanner(msg);
      addToast(msg, 'error', 'Save Failed');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleScrape(entity: TelegramEntity) {
    setActiveAction(`scrape-${entity.telegram_id}`);
    setBanner(`Scraping messages for ${entity.title}...`);
    addToast(`Triggering message scraper for "${entity.title}"...`, 'info', 'Scrape Triggered');
    try {
      const result = await scrapeTelegramEntity(entity.telegram_id);
      const success = Boolean(result.success ?? true);
      if (success) {
        setBanner(`Scrape finished for ${entity.title}.`);
        addToast(`Scraping finished. Messages stored in MongoDB/CSV.`, 'success', 'Scrape Completed');
      } else {
        setBanner(`Scrape failed for ${entity.title}.`);
        addToast(`Scrape completed with warning: ${result.error || 'Check logs'}`, 'warning', 'Scrape Incomplete');
      }
      await refetch();
    } catch (scrapeError) {
      const msg = apiErrorToMessage(scrapeError);
      setBanner(msg);
      addToast(msg, 'error', 'Scrape Failed');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSelectedScrape() {
    if (!selectedIds.length) {
      setBanner('Select one or more entities before starting the queue.');
      return;
    }
    setActiveAction('selected-scrape');
    setBanner(`Queueing ${selectedIds.length} selected entities...`);
    addToast(`Pushing ${selectedIds.length} channels to bulk scraping queue...`, 'info', 'Bulk Scrape queued');
    try {
      await startSelectedScraping({ selected_ids: selectedIds });
      setBanner('Selected scraping started. Queue status is controlled by the backend.');
      addToast('Bulk scraping jobs registered. Monitor progress in queue.', 'success', 'Bulk Scrape Started');
      await refetch();
    } catch (queueError) {
      const msg = apiErrorToMessage(queueError);
      setBanner(msg);
      addToast(msg, 'error', 'Queue Failure');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleDelete(entity: TelegramEntity) {
    setActiveAction(`delete-${entity.telegram_id}`);
    setBanner(`Removing ${entity.title}...`);
    try {
      await deleteTelegramEntity(entity.telegram_id);
      setBanner(`Removed ${entity.title}.`);
      setSelectedIds((current) => current.filter((telegramId) => telegramId !== entity.telegram_id));
      addToast(`Removed "${entity.title}" from database successfully.`, 'success', 'Entity Deleted');
      await refetch();
    } catch (deleteError) {
      const msg = apiErrorToMessage(deleteError);
      setBanner(msg);
      addToast(msg, 'error', 'Delete Failed');
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <PageBlock
      eyebrow="Telegram Explorer"
      title="Telegram Explorer"
      description="Discover Telegram channels and groups, inspect stored metrics, and queue scrapes against the Flask backend."
    >
      <article className="glass-panel rounded-[16px] p-4 lg:p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="section-title">Discovered Entities</h2>
            <p className="mt-1 text-[12px] text-slate-400">Selection and queueing are persisted by the backend.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-[230px] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, username, type"
                className="w-full bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-[13px] font-medium text-slate-100 transition hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSelectedScrape}
              disabled={!selectedIds.length || activeAction === 'selected-scrape'}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 text-[13px] font-medium text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Layers3 className="h-4 w-4" />
              Start Selected Scraping
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-[13px] text-slate-300">
          {banner} {selectedIds.length ? `(${selectedIds.length} selected)` : ''}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => setSelectedIds(filtered.map((e) => e.telegram_id))}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-[12px] font-medium text-slate-300 transition hover:bg-white/10"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-[12px] font-medium text-slate-300 transition hover:bg-white/10"
          >
            Unselect All
          </button>
          <button
            type="button"
            onClick={() => {
              const enabled = filtered.map((e) => e.telegram_id);
              setSelectedIds((current) => Array.from(new Set([...current, ...enabled])));
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-[12px] font-medium text-slate-300 transition hover:bg-white/10"
          >
            Enable All Filtered
          </button>
          <button
            type="button"
            onClick={() => {
              const disabled = filtered.map((e) => e.telegram_id);
              setSelectedIds((current) => current.filter((id) => !disabled.includes(id)));
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-[12px] font-medium text-slate-300 transition hover:bg-white/10"
          >
            Disable All Filtered
          </button>
          <div className="h-5 w-px bg-white/10 mx-2" />
          <button
            type="button"
            onClick={handleSaveSelection}
            disabled={activeAction === 'save-selection'}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-cyan-500/10 border border-cyan-400/20 px-3 text-[12px] font-semibold text-cyan-300 transition hover:bg-cyan-400/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-3.5 w-3.5" />
            Save Selection
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-[16px] border border-white/10">
          <AsyncState
            loading={isLoading && !entities.length}
            error={error}
            empty={!filtered.length}
            title="No Telegram entities"
            description="Trigger a refresh from the backend to discover channels and groups."
            onRetry={refetch}
          >
            <div className="max-h-[72vh] overflow-auto">
              <table className="min-w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-xl">
                  <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <th className="px-3 py-3">
                      <button
                        type="button"
                        onClick={handleToggleAll}
                        className="inline-flex items-center gap-2"
                      >
                        {allFilteredSelected ? (
                          <CheckSquare className="h-4 w-4 text-cyan-300" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-500" />
                        )}
                        Select
                      </button>
                    </th>
                    <th className="px-3 py-3">Avatar</th>
                    <th className="px-3 py-3">Channel Name</th>
                    <th className="px-3 py-3">Username</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Messages</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entity) => {
                    const checked = selectedIds.includes(entity.telegram_id);
                    const rowBusy = activeAction === `scrape-${entity.telegram_id}` || activeAction === `delete-${entity.telegram_id}`;
                    return (
                      <tr key={entity.telegram_id} className="border-t border-white/10 hover:bg-white/[0.03]">
                        <td className="px-3 py-4">
                          <button type="button" onClick={() => toggleSelection(entity.telegram_id)} className="inline-flex items-center">
                            {checked ? <CheckSquare className="h-4 w-4 text-cyan-300" /> : <Square className="h-4 w-4 text-slate-500" />}
                          </button>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                            <Eye className="h-4 w-4" />
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div>
                            <p className="text-[13px] font-medium text-slate-100">{entity.title}</p>
                            <p className="text-[11px] text-slate-500">ID: {entity.telegram_id}</p>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-[13px] text-slate-300">@{entity.username ?? 'unknown'}</td>
                        <td className="px-3 py-4 text-[13px] text-slate-300">{entity.type ?? 'Unknown'}</td>
                        <td className="px-3 py-4 text-[13px] text-slate-300">{entity.messages_stored ?? 0}</td>
                        <td className="px-3 py-4 text-[13px] text-slate-300">{entity.monitoring_status ?? (entity.enabled ? 'Monitoring' : 'Idle')}</td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleScrape(entity)}
                              disabled={rowBusy}
                              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Scrape
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(entity)}
                              disabled={rowBusy}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </AsyncState>
        </div>
      </article>
    </PageBlock>
  );
}
