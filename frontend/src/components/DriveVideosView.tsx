import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Film, RefreshCw } from 'lucide-react';
import { mensagemDeErro } from '../services/venueApi';
import { getDriveVideoContentUrl, getDriveVideos } from '../services/videosApi';
import type { DriveVideo } from '../types/videos';

export function DriveVideosView() {
  const [videos, setVideos] = useState<DriveVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buscarVideos = useCallback(async (signal?: AbortSignal) => {
    try {
      setVideos(await getDriveVideos(signal));
      setError(null);
    } catch (err) {
      if (!signal?.aborted) setError(mensagemDeErro(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect
    void buscarVideos(controller.signal);
    return () => controller.abort();
  }, [buscarVideos]);

  const atualizarVideos = () => {
    setLoading(true);
    setError(null);
    void buscarVideos();
  };

  return (
    <section className="space-y-5 animate-in fade-in duration-200" aria-labelledby="drive-videos-titulo">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="drive-videos-titulo" className="flex items-center gap-2 text-base font-bold text-raiz-text-light sm:text-lg">
            <Film className="h-5 w-5 text-raiz-accent" />
            Vídeos em Nuvem
          </h2>
          <p className="mt-1 text-xs text-raiz-text-light/75">
            Vídeos da pasta configurada no servidor. A reprodução é transmitida pelo backend.
          </p>
        </div>
        <button
          type="button"
          onClick={atualizarVideos}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-raiz-accent/40 bg-raiz-section px-3 py-2 text-xs font-semibold text-raiz-accent transition-colors hover:bg-raiz-accent/15 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar lista
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar os vídeos.</p>
            <p className="mt-1 text-xs text-rose-200/80">{error}</p>
            <p className="mt-2 text-xs text-rose-200/80">
              Confira a variável GOOGLE_DRIVE_APPS_SCRIPT_URL no servidor e se a pasta permite leitura para qualquer pessoa com o link.
            </p>
          </div>
        </div>
      )}

      {loading && videos.length === 0 && !error && (
        <p role="status" className="rounded-xl border border-raiz-border-dark bg-raiz-section p-8 text-center text-sm text-raiz-text-light/75">
          Buscando vídeos em nuvem...
        </p>
      )}

      {!loading && !error && videos.length === 0 && (
        <div className="rounded-xl border border-raiz-border-dark bg-raiz-section p-8 text-center">
          <Film className="mx-auto h-8 w-8 text-raiz-text-light/55" />
          <p className="mt-3 text-sm font-semibold text-raiz-text-light">Nenhum vídeo encontrado</p>
          <p className="mt-1 text-xs text-raiz-text-light/55">
            Verifique se há arquivos de vídeo na pasta e se ela está compartilhada para leitura.
          </p>
        </div>
      )}

      {videos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <article key={video.id} className="overflow-hidden rounded-xl border border-raiz-border-dark bg-raiz-section">
              <video
                className="aspect-video w-full bg-black object-contain"
                controls
                preload="metadata"
                poster={video.thumbnail_url || undefined}
                src={getDriveVideoContentUrl(video.content_url)}
                aria-label={`Reproduzir ${video.name}`}
              >
                Seu navegador não oferece suporte à reprodução de vídeo.
              </video>
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-raiz-text-light" title={video.name}>
                  {video.name}
                </p>
                <p className="mt-1 text-xs text-raiz-text-light/55">
                  {video.size ? `${(video.size / (1024 * 1024)).toFixed(1)} MB · ` : ''}
                  {video.mime_type}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
