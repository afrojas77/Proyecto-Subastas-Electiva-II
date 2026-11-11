import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { BrandMark } from '../../components/brand/BrandMark';
import { ApiError } from '../../lib/api-client';
import {
  getMyAuctionActivity,
  listLiveAuctions,
  type AuctionSummary,
} from '../auctions/auction.api';
import { PlaceBidModal } from '../auctions/PlaceBidModal';
import { PublishAuctionModal } from '../auctions/PublishAuctionModal';
import { clearSession, getSession } from '../auth/session';

type Module = 'live' | 'publish' | 'history' | 'settings';

interface DashboardPageProps {
  onLogout: () => void;
}

export function DashboardPage({ onLogout }: DashboardPageProps) {
  const [activeModule, setActiveModule] = useState<Module>('live');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
  const [publishedAuctions, setPublishedAuctions] = useState<AuctionSummary[]>(
    [],
  );
  const [participatedAuctions, setParticipatedAuctions] = useState<
    AuctionSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [publishedLoading, setPublishedLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [publishedError, setPublishedError] = useState<string>();
  const [historyError, setHistoryError] = useState<string>();
  const [selectedAuction, setSelectedAuction] = useState<AuctionSummary>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const session = getSession();
  const currentUserId = session?.user.id ?? '';
  const accessToken = session?.accessToken ?? '';

  useEffect(() => {
    let mounted = true;
    void listLiveAuctions()
      .then((result) => {
        if (mounted) {
          setAuctions(
            result.auctions.filter(
              (auction) => auction.sellerId !== currentUserId,
            ),
          );
        }
      })
      .catch((caught: unknown) => {
        if (mounted) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'No fue posible cargar las subastas.',
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    void getMyAuctionActivity(accessToken)
      .then((result) => {
        if (mounted) {
          setPublishedAuctions(
            result.publishedAuctions.filter(
              (auction) => auction.sellerId === currentUserId,
            ),
          );
          setParticipatedAuctions(result.participatedAuctions);
        }
      })
      .catch((caught: unknown) => {
        if (mounted) {
          setPublishedError(
            caught instanceof ApiError
              ? caught.message
              : 'No fue posible cargar tus subastas.',
          );
          setHistoryError(
            caught instanceof ApiError
              ? caught.message
              : 'No fue posible cargar tu historial de pujas.',
          );
        }
      })
      .finally(() => {
        if (mounted) setPublishedLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [accessToken, currentUserId]);

  const categories = useMemo(
    () => ['Todas', ...new Set(auctions.map((auction) => auction.category))],
    [auctions],
  );
  const visibleAuctions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return auctions.filter(
      (auction) =>
        (category === 'Todas' || auction.category === category) &&
        (!query ||
          auction.article.denomination
            .toLocaleLowerCase('es')
            .includes(query) ||
          auction.article.description.toLocaleLowerCase('es').includes(query)),
    );
  }, [auctions, category, search]);

  function logout() {
    clearSession();
    onLogout();
  }

  function openPublishForm() {
    setPublishOpen(true);
  }

  function closePublishForm() {
    setPublishOpen(false);
  }

  function handlePublished(auction: AuctionSummary) {
    setPublishedAuctions((current) => [
      auction,
      ...current.filter((item) => item.id !== auction.id),
    ]);
    setPublishedError(undefined);
    setPublishOpen(false);
    setActiveModule('publish');
  }

  function refreshBidHistory() {
    void getMyAuctionActivity(accessToken)
      .then((result) => {
        setParticipatedAuctions(result.participatedAuctions);
        setHistoryError(undefined);
      })
      .catch((caught: unknown) => {
        setHistoryError(
          caught instanceof ApiError
            ? caught.message
            : 'No fue posible actualizar tu historial de pujas.',
        );
      });
  }

  return (
    <main className="dashboard-shell min-h-screen overflow-hidden bg-[#f4f0e8] text-[#1c2521]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden h-screen min-h-screen flex-col border-r border-white/10 bg-[#17251f] py-6 text-white shadow-[12px_0_40px_rgba(16,28,23,0.08)] transition-[width,padding] duration-300 md:flex ${
          sidebarCollapsed ? 'w-[84px] px-3' : 'w-[272px] px-5'
        }`}
      >
        <button
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          className="absolute -right-4 top-7 z-10 flex size-8 items-center justify-center rounded-full border border-[#d5cec2] bg-[#f4f0e8] text-[#17251f] shadow-md transition hover:border-[#a65c35] hover:bg-[#a65c35] hover:text-white"
          aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          <span
            className={`text-lg leading-none transition-transform duration-300 ${
              sidebarCollapsed ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            ‹
          </span>
        </button>

        <div
          className={`flex h-8 items-center overflow-hidden [&_*]:text-white ${
            sidebarCollapsed ? 'justify-center px-0' : 'px-2'
          }`}
        >
          {sidebarCollapsed ? (
            <span className="font-display text-2xl">A</span>
          ) : (
            <BrandMark />
          )}
        </div>
        {sidebarCollapsed ? (
          <div className="mb-5 mt-8 h-px bg-white/10" />
        ) : (
          <p className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
            Menú principal
          </p>
        )}
        <nav className="space-y-1">
          <SidebarButton
            collapsed={sidebarCollapsed}
            active={activeModule === 'live'}
            icon={<LiveIcon />}
            label="Subastas en vivo"
            badge={auctions.length || undefined}
            onClick={() => setActiveModule('live')}
          />
          <SidebarButton
            collapsed={sidebarCollapsed}
            active={activeModule === 'publish'}
            icon={<PlusIcon />}
            label="Publicar subasta"
            onClick={() => setActiveModule('publish')}
          />
          <SidebarButton
            collapsed={sidebarCollapsed}
            active={activeModule === 'history'}
            icon={<HistoryIcon />}
            label="Historial de pujas"
            badge={participatedAuctions.length || undefined}
            onClick={() => setActiveModule('history')}
          />
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <SidebarButton
            collapsed={sidebarCollapsed}
            active={activeModule === 'settings'}
            icon={<SettingsIcon />}
            label="Configuración"
            onClick={() => setActiveModule('settings')}
          />
          <SidebarButton
            collapsed={sidebarCollapsed}
            icon={<LogoutIcon />}
            label="Cerrar sesión"
            onClick={logout}
          />
          <div
            className={`mt-5 flex items-center rounded-sm bg-white/[0.055] ${
              sidebarCollapsed ? 'justify-center p-2' : 'gap-3 p-3'
            }`}
            title={
              sidebarCollapsed
                ? (session?.user.name ?? 'Usuario Aurea')
                : undefined
            }
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#a65c35] text-lg font-semibold">
              {(session?.user.name ?? session?.user.email ?? 'U')
                .charAt(0)
                .toUpperCase()}
            </span>
            <span className={sidebarCollapsed ? 'hidden' : 'min-w-0'}>
              <strong className="block truncate text-sm font-semibold">
                {session?.user.name ?? 'Usuario Aurea'}
              </strong>
              <small className="block truncate text-[11px] text-white/45">
                {session?.user.email}
              </small>
            </span>
          </div>
        </div>
      </aside>

      <section
        className={`h-screen min-w-0 overflow-y-auto transition-[margin] duration-300 ${
          sidebarCollapsed ? 'md:ml-[84px]' : 'md:ml-[272px]'
        }`}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#ded8cd] bg-[#f4f0e8]/95 px-5 backdrop-blur md:hidden">
          <BrandMark />
          <button
            type="button"
            onClick={logout}
            className="text-xs font-bold uppercase tracking-[0.12em] text-[#a65c35]"
          >
            Salir
          </button>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-[#ded8cd] px-5 py-3 md:hidden">
          <MobileNav
            active={activeModule === 'live'}
            onClick={() => setActiveModule('live')}
          >
            En vivo
          </MobileNav>
          <MobileNav
            active={activeModule === 'publish'}
            onClick={() => setActiveModule('publish')}
          >
            Publicar
          </MobileNav>
          <MobileNav
            active={activeModule === 'history'}
            onClick={() => setActiveModule('history')}
          >
            Mis pujas
          </MobileNav>
          <MobileNav
            active={activeModule === 'settings'}
            onClick={() => setActiveModule('settings')}
          >
            Ajustes
          </MobileNav>
        </nav>

        {activeModule === 'live' ? (
          <LiveAuctions
            auctions={visibleAuctions}
            total={auctions.length}
            loading={loading}
            error={error}
            search={search}
            category={category}
            categories={categories}
            onSearch={setSearch}
            onCategory={setCategory}
            onSelectAuction={setSelectedAuction}
          />
        ) : activeModule === 'publish' ? (
          <PublishedAuctions
            auctions={publishedAuctions}
            loading={publishedLoading}
            error={publishedError}
            onPublish={openPublishForm}
          />
        ) : activeModule === 'history' ? (
          <BidHistory
            auctions={participatedAuctions}
            currentUserId={currentUserId}
            loading={publishedLoading}
            error={historyError}
          />
        ) : (
          <ModulePreview module={activeModule} />
        )}
      </section>
      {publishOpen ? (
        <PublishAuctionModal
          accessToken={session?.accessToken ?? ''}
          onClose={closePublishForm}
          onPublished={handlePublished}
        />
      ) : null}
      {selectedAuction ? (
        <PlaceBidModal
          auction={selectedAuction}
          accessToken={accessToken}
          currentUserId={currentUserId}
          onClose={() => setSelectedAuction(undefined)}
          onBidAccepted={refreshBidHistory}
        />
      ) : null}
    </main>
  );
}

interface LiveAuctionsProps {
  auctions: AuctionSummary[];
  total: number;
  loading: boolean;
  error?: string;
  search: string;
  category: string;
  categories: string[];
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  onSelectAuction: (auction: AuctionSummary) => void;
}

function LiveAuctions(props: LiveAuctionsProps) {
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a65c35]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#a65c35]" />
            En directo ahora
          </p>
          <h1 className="font-display text-4xl tracking-[-0.025em] text-[#17251f] sm:text-5xl">
            Subastas en vivo
          </h1>
          <p className="mt-2 text-sm text-[#737873]">
            Descubre piezas únicas y participa antes de que termine el tiempo.
          </p>
        </div>
        <div className="relative w-full lg:w-80">
          <SearchIcon />
          <input
            type="search"
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="Buscar una pieza…"
            className="h-11 w-full rounded-sm border border-[#d5cfc4] bg-white/55 pl-11 pr-4 text-sm outline-none transition focus:border-[#a65c35] focus:bg-white focus:ring-2 focus:ring-[#a65c35]/10"
          />
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between gap-5 border-b border-[#dcd6cb] pb-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {props.categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => props.onCategory(item)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${
                props.category === item
                  ? 'bg-[#17251f] text-white'
                  : 'border border-[#d7d1c6] bg-white/35 text-[#6d736e] hover:border-[#a65c35] hover:text-[#a65c35]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="hidden whitespace-nowrap text-xs text-[#8a8e89] sm:block">
          {props.total}{' '}
          {props.total === 1 ? 'subasta activa' : 'subastas activas'}
        </p>
      </div>

      {props.loading ? (
        <div className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <AuctionSkeleton key={item} />
          ))}
        </div>
      ) : props.error ? (
        <EmptyState
          title="No pudimos cargar las subastas"
          description={props.error}
        />
      ) : props.auctions.length === 0 ? (
        <EmptyState
          title={
            props.total
              ? 'No encontramos coincidencias'
              : 'Aún no hay subastas en vivo'
          }
          description={
            props.total
              ? 'Prueba con otra búsqueda o categoría.'
              : 'Cuando se publique una subasta activa aparecerá en este espacio.'
          }
        />
      ) : (
        <div className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-3">
          {props.auctions.map((auction, index) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              index={index}
              onAction={() => props.onSelectAuction(auction)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AuctionCard({
  auction,
  index,
  onAction,
}: {
  auction: AuctionSummary;
  index: number;
  onAction: () => void;
}) {
  const palette = ['#31534a', '#8c5136', '#4b4a64', '#6e633c'][index % 4];
  return (
    <article className="group overflow-hidden rounded-sm border border-[#d9d3c8] bg-white/50 transition duration-300 hover:-translate-y-1 hover:border-[#b9aa99] hover:shadow-[0_18px_45px_rgba(44,35,27,0.1)]">
      <div
        className="relative flex h-44 items-center justify-center overflow-hidden"
        style={{ backgroundColor: palette }}
      >
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_25%_20%,white_0,transparent_38%),linear-gradient(135deg,transparent_45%,white_46%,transparent_47%)]" />
        <span className="font-display text-6xl text-white/70">
          {auction.article.denomination.charAt(0)}
        </span>
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#f4f0e8]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8b3f2c]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#a64731]" />{' '}
          En vivo
        </span>
        <span className="absolute bottom-3 right-3 rounded-sm bg-[#17251f]/85 px-2.5 py-1.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur">
          {timeRemaining(auction.closesAt)}
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a65c35]">
            {auction.category}
          </span>
          <span className="text-[10px] uppercase text-[#92958f]">
            {conservationLabel(auction.article.conservationState)}
          </span>
        </div>
        <h2 className="mt-2 truncate font-display text-[23px] text-[#17251f]">
          {auction.article.denomination}
        </h2>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[#747974]">
          {auction.article.description}
        </p>
        <div className="mt-5 flex items-end justify-between border-t border-[#e1dbd1] pt-4">
          <span>
            <small className="block text-[10px] font-bold uppercase tracking-[0.13em] text-[#989a95]">
              Precio base
            </small>
            <strong className="text-xl font-semibold tabular-nums text-[#17251f]">
              {formatCurrency(auction.basePrice)}
            </strong>
          </span>
          <button
            type="button"
            onClick={onAction}
            className="flex size-10 items-center justify-center rounded-full bg-[#17251f] text-lg text-white transition group-hover:bg-[#a65c35]"
            aria-label={`Pujar por ${auction.article.denomination}`}
          >
            →
          </button>
        </div>
      </div>
    </article>
  );
}

function PublishedAuctions({
  auctions,
  loading,
  error,
  onPublish,
}: {
  auctions: AuctionSummary[];
  loading: boolean;
  error?: string;
  onPublish: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a65c35]">
            Tu catálogo
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] text-[#17251f] sm:text-5xl">
            Mis subastas publicadas
          </h1>
          <p className="mt-2 text-sm text-[#737873]">
            Aquí aparecen exclusivamente las subastas creadas por tu cuenta.
          </p>
        </div>
        <button
          type="button"
          onClick={onPublish}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-3 bg-[#17251f] px-6 text-xs font-bold uppercase tracking-[0.13em] text-white transition hover:bg-[#a65c35]"
        >
          <span className="text-xl font-normal" aria-hidden="true">
            +
          </span>
          Nueva subasta
        </button>
      </div>

      <div className="mt-7 border-b border-[#dcd6cb] pb-4 text-xs text-[#858984]">
        {auctions.length}{' '}
        {auctions.length === 1 ? 'subasta publicada' : 'subastas publicadas'}
      </div>

      {loading ? (
        <div className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <AuctionSkeleton key={item} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="No pudimos cargar tus subastas"
          description={error}
        />
      ) : auctions.length === 0 ? (
        <div className="mt-10 rounded-sm border border-dashed border-[#cbc3b7] px-6 py-16 text-center">
          <button
            type="button"
            onClick={onPublish}
            className="group mx-auto flex size-16 items-center justify-center rounded-full bg-[#17251f] p-5 text-white transition hover:scale-105 hover:bg-[#a65c35]"
            aria-label="Crear la primera subasta"
          >
            <span className="size-full transition-transform group-hover:rotate-90">
              <PlusIcon />
            </span>
          </button>
          <h2 className="mt-5 font-display text-2xl font-semibold text-[#17251f]">
            Publica tu primera subasta
          </h2>
          <p className="mt-2 text-sm text-[#7c807b]">
            Las piezas que publiques aparecerán aquí, sin mezclarse con las de
            otros vendedores.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-3">
          {auctions.map((auction, index) => (
            <OwnAuctionCard key={auction.id} auction={auction} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

function OwnAuctionCard({
  auction,
  index,
}: {
  auction: AuctionSummary;
  index: number;
}) {
  const palette = ['#6e633c', '#31534a', '#4b4a64', '#8c5136'][index % 4];
  const status = statusPresentation(auction.status);
  return (
    <article className="overflow-hidden rounded-sm border border-[#d9d3c8] bg-white/50">
      <div
        className="relative flex h-36 items-center justify-center overflow-hidden"
        style={{ backgroundColor: palette }}
      >
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_25%_20%,white_0,transparent_38%),linear-gradient(135deg,transparent_45%,white_46%,transparent_47%)]" />
        <span className="font-display text-5xl text-white/70">
          {auction.article.denomination.charAt(0)}
        </span>
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <div className="p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a65c35]">
          {auction.category}
        </p>
        <h2 className="mt-2 truncate font-display text-xl font-semibold text-[#17251f]">
          {auction.article.denomination}
        </h2>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[#747974]">
          {auction.article.description}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#e1dbd1] pt-4">
          <span>
            <small className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[#989a95]">
              Precio base
            </small>
            <strong className="mt-1 block text-sm font-semibold tabular-nums text-[#17251f]">
              {formatCurrency(auction.basePrice)}
            </strong>
          </span>
          <span>
            <small className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[#989a95]">
              {auction.status === 'OPEN'
                ? 'Tiempo restante'
                : 'Fecha de cierre'}
            </small>
            <strong className="mt-1 block text-sm font-semibold tabular-nums text-[#17251f]">
              {auction.status === 'OPEN'
                ? timeRemaining(auction.closesAt)
                : formatDate(auction.closesAt)}
            </strong>
          </span>
        </div>
      </div>
    </article>
  );
}

type HistoryFilter = 'ALL' | 'ACTIVE' | 'WON' | 'LOST' | 'OTHER';

function BidHistory({
  auctions,
  currentUserId,
  loading,
  error,
}: {
  auctions: AuctionSummary[];
  currentUserId: string;
  loading: boolean;
  error?: string;
}) {
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const sortedAuctions = useMemo(
    () =>
      [...auctions].sort(
        (left, right) =>
          new Date(right.userLastBid?.placedAt ?? right.publishedAt).getTime() -
          new Date(left.userLastBid?.placedAt ?? left.publishedAt).getTime(),
      ),
    [auctions],
  );
  const visible = sortedAuctions.filter((auction) => {
    if (filter === 'ALL') return true;
    return participationState(auction, currentUserId).group === filter;
  });

  const filters: Array<{ key: HistoryFilter; label: string }> = [
    { key: 'ALL', label: 'Todas' },
    { key: 'ACTIVE', label: 'En curso' },
    { key: 'WON', label: 'Ganadas' },
    { key: 'LOST', label: 'Perdidas' },
    { key: 'OTHER', label: 'Otros estados' },
  ];

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a65c35]">
          Tu actividad
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] text-[#17251f] sm:text-5xl">
          Historial de pujas
        </h1>
        <p className="mt-2 text-sm text-[#737873]">
          Sigue el resultado de todas las subastas en las que participaste.
        </p>
      </div>

      <div className="mt-7 flex gap-2 overflow-x-auto border-b border-[#dcd6cb] pb-4">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${
              filter === item.key
                ? 'bg-[#17251f] text-white'
                : 'border border-[#d7d1c6] bg-white/35 text-[#6d736e] hover:border-[#a65c35] hover:text-[#a65c35]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 pt-6">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-sm border border-[#ded8ce] bg-white/40"
            />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="No pudimos cargar tu historial"
          description={error}
        />
      ) : auctions.length === 0 ? (
        <EmptyState
          title="Todavía no has realizado ninguna puja"
          description="Cuando participes en una subasta, su avance y resultado aparecerán aquí."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No hay resultados en este estado"
          description="Selecciona otro filtro para consultar el resto de tu actividad."
        />
      ) : (
        <div className="space-y-3 pt-6">
          {visible.map((auction) => (
            <BidHistoryRow
              key={auction.id}
              auction={auction}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BidHistoryRow({
  auction,
  currentUserId,
}: {
  auction: AuctionSummary;
  currentUserId: string;
}) {
  const state = participationState(auction, currentUserId);
  return (
    <article className="grid gap-4 rounded-sm border border-[#d9d3c8] bg-white/50 p-4 transition hover:border-[#bbaea0] sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(110px,0.35fr))] sm:items-center sm:p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-[#31534a] font-display text-lg font-semibold text-white">
            {auction.article.denomination.charAt(0)}
          </span>
          <span className="min-w-0">
            <small className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[#a65c35]">
              {auction.category}
            </small>
            <strong className="block truncate font-display text-lg font-semibold text-[#17251f]">
              {auction.article.denomination}
            </strong>
          </span>
        </div>
      </div>
      <HistoryValue
        label="Tu última puja"
        value={
          auction.userLastBid
            ? formatCurrency(auction.userLastBid.amount)
            : 'Sin información'
        }
      />
      <HistoryValue
        label="Puja actual"
        value={
          auction.highestBid
            ? formatCurrency(auction.highestBid.amount)
            : formatCurrency(auction.basePrice)
        }
      />
      <div className="sm:text-right">
        <span
          className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.11em] ${state.className}`}
        >
          {state.label}
        </span>
        <small className="mt-2 block text-[10px] tabular-nums text-[#8b8e89]">
          {auction.status === 'OPEN'
            ? `Cierra en ${timeRemaining(auction.closesAt)}`
            : `Finalizó ${formatDate(auction.closesAt)}`}
        </small>
      </div>
    </article>
  );
}

function HistoryValue({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[#989a95]">
        {label}
      </small>
      <strong className="mt-1 block text-sm font-semibold tabular-nums text-[#17251f]">
        {value}
      </strong>
    </span>
  );
}

function participationState(auction: AuctionSummary, currentUserId: string) {
  if (auction.status === 'OPEN') {
    return auction.highestBid?.bidderId === currentUserId
      ? {
          group: 'ACTIVE' as const,
          label: 'Liderando',
          className: 'bg-[#dce9e2] text-[#315d4a]',
        }
      : {
          group: 'ACTIVE' as const,
          label: 'En curso · superada',
          className: 'bg-[#eee4d5] text-[#865b31]',
        };
  }
  if (auction.status === 'CLOSED') {
    return auction.winnerId === currentUserId
      ? {
          group: 'WON' as const,
          label: 'Ganada',
          className: 'bg-[#dce9e2] text-[#315d4a]',
        }
      : {
          group: 'LOST' as const,
          label: 'Perdida',
          className: 'bg-[#eadbd7] text-[#8b3f2c]',
        };
  }
  if (auction.status === 'DEFAULTED') {
    return auction.winnerId === currentUserId
      ? {
          group: 'OTHER' as const,
          label: 'Incumplida',
          className: 'bg-[#eadbd7] text-[#8b3f2c]',
        }
      : {
          group: 'LOST' as const,
          label: 'Perdida',
          className: 'bg-[#eadbd7] text-[#8b3f2c]',
        };
  }
  return {
    group: 'OTHER' as const,
    label: statusPresentation(auction.status).label,
    className: 'bg-[#ebe7df] text-[#666b66]',
  };
}

function ModulePreview({ module }: { module: 'settings' }) {
  const content = {
    settings: {
      eyebrow: 'Tu cuenta',
      title: 'Configuración',
      description:
        'Administra tus datos personales, seguridad y preferencias de notificación.',
      icon: <SettingsIcon />,
    },
  }[module];
  return (
    <div className="mx-auto flex min-h-[75vh] max-w-3xl items-center justify-center px-6 py-12 text-center">
      <div>
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#17251f] p-5 text-white">
          {content.icon}
        </span>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a65c35]">
          {content.eyebrow}
        </p>
        <h1 className="mt-2 font-display text-5xl text-[#17251f]">
          {content.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-[#737873]">
          {content.description}
        </p>
        <span className="mt-7 inline-block rounded-full border border-[#d4cdc1] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b8e89]">
          Módulo preparado para la siguiente etapa
        </span>
      </div>
    </div>
  );
}

function SidebarButton({
  active = false,
  collapsed = false,
  icon,
  label,
  badge,
  onClick,
}: {
  active?: boolean;
  collapsed?: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center rounded-sm py-3 text-left text-sm transition ${
        collapsed ? 'justify-center px-0' : 'gap-3 px-3'
      } ${active ? 'bg-[#a65c35] font-semibold text-white shadow-lg shadow-black/10' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'}`}
    >
      <span className="size-[18px] shrink-0">{icon}</span>
      <span className={collapsed ? 'sr-only' : 'flex-1'}>{label}</span>
      {badge && !collapsed ? (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function MobileNav({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ${active ? 'bg-[#17251f] text-white' : 'border border-[#d7d1c6] text-[#707570]'}`}
    >
      {children}
    </button>
  );
}

function AuctionSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-sm border border-[#ded8ce]">
      <div className="h-44 bg-[#ded9cf]" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-20 bg-[#ded9cf]" />
        <div className="h-6 w-3/4 bg-[#ded9cf]" />
        <div className="h-4 bg-[#e4dfd6]" />
        <div className="h-10 border-t border-[#ded9cf]" />
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-10 rounded-sm border border-dashed border-[#cbc3b7] px-6 py-20 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#e6dfd4] text-xl text-[#a65c35]">
        ◇
      </span>
      <h2 className="mt-4 font-display text-2xl text-[#17251f]">{title}</h2>
      <p className="mt-2 text-sm text-[#7c807b]">{description}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
function statusPresentation(status: string) {
  return (
    {
      OPEN: {
        label: 'En vivo',
        className: 'bg-[#f4f0e8] text-[#8b3f2c]',
      },
      CLOSED: {
        label: 'Adjudicada',
        className: 'bg-[#dce9e2] text-[#315d4a]',
      },
      DESERTED: {
        label: 'Sin pujas',
        className: 'bg-[#ebe7df] text-[#666b66]',
      },
      CANCELLED: {
        label: 'Cancelada',
        className: 'bg-[#eadbd7] text-[#8b3f2c]',
      },
      DEFAULTED: {
        label: 'Incumplida',
        className: 'bg-[#eadbd7] text-[#8b3f2c]',
      },
    }[status] ?? {
      label: status,
      className: 'bg-[#ebe7df] text-[#666b66]',
    }
  );
}
function timeRemaining(value: string) {
  const milliseconds = new Date(value).getTime() - Date.now();
  if (milliseconds <= 0) return 'Finalizando';
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return hours >= 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h`
    : `${hours}h ${minutes}m`;
}
function conservationLabel(
  value: AuctionSummary['article']['conservationState'],
) {
  return {
    NEW: 'Nuevo',
    LIKE_NEW: 'Como nuevo',
    USED: 'Usado',
    RESTORED: 'Restaurado',
  }[value];
}

function BaseIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-full"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
function LiveIcon() {
  return (
    <BaseIcon>
      <path
        d="M4 6h16v12H4V6Zm4 12v2m8-2v2M8 10h8m-8 4h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </BaseIcon>
  );
}
function PlusIcon() {
  return (
    <BaseIcon>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </BaseIcon>
  );
}
function HistoryIcon() {
  return (
    <BaseIcon>
      <path
        d="M4 12a8 8 0 1 0 2-5.3L4 9m0-5v5h5m3-2v5l3 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </BaseIcon>
  );
}
function SettingsIcon() {
  return (
    <BaseIcon>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-3.5 2-1-2-3-2 .4a7 7 0 0 0-1.5-.9L15 5h-6l-.5 2.5a7 7 0 0 0-1.5.9L5 8l-2 3 2 1a7 7 0 0 0 0 2l-2 1 2 3 2-.4a7 7 0 0 0 1.5.9L9 21h6l.5-2.5a7 7 0 0 0 1.5-.9l2 .4 2-3-2-1a7 7 0 0 0 0-2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </BaseIcon>
  );
}
function LogoutIcon() {
  return (
    <BaseIcon>
      <path
        d="M10 5H5v14h5m5-4 4-3-4-3m4 3H9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </BaseIcon>
  );
}
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8b8f89]"
      aria-hidden="true"
    >
      <path
        d="m20 20-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
