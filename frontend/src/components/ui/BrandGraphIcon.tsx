interface BrandGraphIconProps {
  size?: 'large' | 'small';
  className?: string;
}

// 共用品牌图标：入口页与节点详情空状态使用同一组渐变、连线和节点颜色。
export function BrandGraphIcon({ size = 'large', className = '' }: BrandGraphIconProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-gradient-to-br from-emerald-500 to-sky-600 shadow-lg ${
        size === 'large' ? 'h-20 w-20 rounded-2xl' : 'h-14 w-14 rounded-xl'
      } ${className}`}
    >
      <svg viewBox="0 0 80 80" className={size === 'large' ? 'h-14 w-14' : 'h-10 w-10'} fill="none">
        <path d="M40 40 18 21M40 40 63 20M40 40 19 62M40 40 63 61" stroke="white" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
        <circle cx="40" cy="40" r="10" fill="#FFF1B8" />
        <circle cx="18" cy="21" r="6" fill="#E1FFF7" />
        <circle cx="63" cy="20" r="6" fill="#E1FFF7" />
        <circle cx="19" cy="62" r="6" fill="#E1FFF7" />
        <circle cx="63" cy="61" r="6" fill="#E1FFF7" />
      </svg>
    </div>
  );
}
