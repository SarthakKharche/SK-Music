import { useOffline } from '../../contexts/OfflineContext';
import { FiWifiOff } from 'react-icons/fi';

const OfflineBanner: React.FC = () => {
  const { isOffline } = useOffline();

  if (!isOffline) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/90 via-orange-500/90 to-amber-600/90 text-black px-4 py-3 flex items-center justify-center gap-2 font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-md">
      <div className="p-1.5 rounded-full bg-black/10 text-black">
        <FiWifiOff size={16} />
      </div>
      <span className="text-sm tracking-tight">
        You're offline. Only cached content is available.
      </span>
    </div>
  );
};

export default OfflineBanner;
