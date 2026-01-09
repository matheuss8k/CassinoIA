import React, { useState, useEffect } from 'react';
import { User, StoreItem } from '../types';
import { DatabaseService } from '../services/database';
import { User as UserIcon, Trophy as TrophyIcon, Target, ShoppingBag } from 'lucide-react';
import { Notification } from '../components/UI/Notification';

// Sub-components
import { ProfileHeader } from '../components/Profile/ProfileHeader';
import { ProfileInfo } from '../components/Profile/ProfileInfo';
import { MissionsTab } from '../components/Profile/MissionsTab';
import { TrophiesTab } from '../components/Profile/TrophiesTab';
import { StoreTab } from '../components/Profile/StoreTab';
import { EditModal, PurchaseModal } from '../components/Profile/ProfileModals';
import { FREE_AVATAR_IDS, DEFAULT_FRAME_ID } from '../components/Profile/profile.styles';

interface UserProfileProps {
  user: User;
  onUpdateUser?: (updatedUser: User) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ user, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'missions' | 'trophies' | 'store'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTab, setEditTab] = useState<'avatar' | 'frame'>('avatar'); // Used to open modal on specific tab
  const [isUploading, setIsUploading] = useState(false);
  const [timeToReset, setTimeToReset] = useState<string>('');
  
  // Notification State
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [notifyType, setNotifyType] = useState<'success' | 'error' | 'info'>('info');

  // Purchase Modal State
  const [purchaseItem, setPurchaseItem] = useState<StoreItem | null>(null);
  
  // Store Items
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loadingStore, setLoadingStore] = useState(false);

  // --- EFFECTS ---

  // Fetch Store Items when tab is active or modal is open
  useEffect(() => {
      if (activeTab === 'store' || isEditModalOpen) {
          const fetchStore = async () => {
              setLoadingStore(true);
              try {
                  const items = await DatabaseService.getStoreItems();
                  setStoreItems(items);
              } catch (e) {
                  console.error("Failed to load store");
              } finally {
                  setLoadingStore(false);
              }
          };
          fetchStore();
      }
  }, [activeTab, isEditModalOpen]);

  // Reset Timer
  useEffect(() => {
    const updateTimer = () => {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setHours(24, 0, 0, 0); 
        const diff = tomorrow.getTime() - now.getTime();
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setTimeToReset(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS ---

  const handleEquip = async (itemId: string, type: 'avatar' | 'frame') => {
      const isFree = (type === 'avatar' && FREE_AVATAR_IDS.includes(itemId)) || (type === 'frame' && itemId === DEFAULT_FRAME_ID);
      const isOwned = user.ownedItems?.includes(itemId);

      if (!isFree && !isOwned) return;

      try {
          if (!user.id) return;
          await DatabaseService.updateAvatar(user.id, itemId, type);
          
          const updates: Partial<User> = {};
          if (type === 'avatar') updates.avatarId = itemId;
          else updates.frameId = itemId;
          
          if (onUpdateUser) onUpdateUser({ ...user, ...updates });
          
          setNotifyMsg("Item equipado com sucesso!");
          setNotifyType("success");
      } catch (e: any) { 
          setNotifyMsg("Erro ao equipar item."); 
          setNotifyType("error");
      }
  };

  const handleVerifyRequest = async () => {
      if (user.documentsStatus === 'PENDING' || user.isVerified) return;
      setIsUploading(true);
      setTimeout(async () => {
          try {
              await DatabaseService.requestVerification(user.id);
              if (onUpdateUser) onUpdateUser({ ...user, documentsStatus: 'PENDING' as any });
              setNotifyMsg("Documentos enviados para análise!");
              setNotifyType("success");
          } catch (e) { 
              setNotifyMsg("Erro ao enviar documentos."); 
              setNotifyType("error");
          } 
          finally { setIsUploading(false); }
      }, 2000);
  };

  const handlePurchaseClick = (item: StoreItem) => {
      if (user.ownedItems?.includes(item.id) && item.type === 'cosmetic') return;
      if (user.loyaltyPoints < item.cost) { 
          setNotifyMsg("Pontos de fidelidade insuficientes!");
          setNotifyType("error");
          return; 
      }
      setPurchaseItem(item);
  };

  const confirmPurchase = async () => {
      if (!purchaseItem) return;
      
      try {
          const res = await DatabaseService.purchaseItem(user.id, purchaseItem.id, purchaseItem.cost);
          if (onUpdateUser) {
              onUpdateUser({ ...user, loyaltyPoints: res.newPoints, ownedItems: res.ownedItems });
          }
          setNotifyMsg(`${purchaseItem.name} adquirido!`);
          setNotifyType("success");
          setPurchaseItem(null);
      } catch (e: any) { 
          setNotifyMsg(e.message || "Erro na compra.");
          setNotifyType("error");
      }
  };

  // Logic for Modal Data
  const ownedPremiumAvatars = storeItems.filter(i => i.category === 'avatar' && user.ownedItems?.includes(i.id));
  const ownedFrames = storeItems.filter(i => i.category === 'frame' && i.id !== DEFAULT_FRAME_ID && user.ownedItems?.includes(i.id));

  return (
    <>
      <Notification message={notifyMsg} type={notifyType} onClose={() => setNotifyMsg(null)} />

      <PurchaseModal 
          item={purchaseItem} 
          user={user} 
          onClose={() => setPurchaseItem(null)} 
          onConfirm={confirmPurchase} 
      />

      <EditModal 
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          user={user}
          ownedPremiumAvatars={ownedPremiumAvatars}
          ownedFrames={ownedFrames}
          onEquip={handleEquip}
          initialTab={editTab}
      />

      {/* MAIN CONTAINER: Increased horizontal padding for centralization (p-4 md:p-10 lg:px-20) */}
      <div className="w-full h-full overflow-y-auto no-scrollbar p-4 md:p-10 lg:px-24 animate-slide-up pb-10 relative">
        {/* INNER WRAPPER: Constrained to max-w-5xl for professional centered look */}
        <div className="max-w-5xl mx-auto space-y-6">
            
            <ProfileHeader 
                user={user} 
                onEditClick={() => { setIsEditModalOpen(true); setEditTab('avatar'); }} 
            />

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {[ 
                    { id: 'profile', icon: <UserIcon size={14} />, label: 'Perfil' }, 
                    { id: 'missions', icon: <Target size={14} />, label: 'Missões' }, 
                    { id: 'trophies', icon: <TrophyIcon size={14} />, label: 'Conquistas' }, 
                    { id: 'store', icon: <ShoppingBag size={14} />, label: 'Loja' } 
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)} 
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap border ${activeTab === tab.id ? 'bg-white text-black border-white shadow-md scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'profile' && (
                    <ProfileInfo 
                        user={user} 
                        onVerifyRequest={handleVerifyRequest} 
                        isUploading={isUploading} 
                    />
                )}
                
                {activeTab === 'missions' && (
                    <MissionsTab 
                        missions={user.missions} 
                        timeToReset={timeToReset} 
                    />
                )}
                
                {activeTab === 'trophies' && (
                    <TrophiesTab 
                        unlockedIds={user.unlockedTrophies} 
                    />
                )}
                
                {activeTab === 'store' && (
                    <StoreTab 
                        items={storeItems} 
                        user={user} 
                        loading={loadingStore} 
                        onPurchaseClick={handlePurchaseClick}
                        onEquipRequest={(cat) => { setIsEditModalOpen(true); setEditTab(cat); }}
                    />
                )}
            </div>
            
            <div className="w-full text-center py-6 text-slate-600 text-[9px] uppercase tracking-widest font-bold opacity-50 select-none">
                &copy; 2024 Cassino IA. Jogue com responsabilidade.
            </div>
        </div>
      </div>
    </>
  );
};