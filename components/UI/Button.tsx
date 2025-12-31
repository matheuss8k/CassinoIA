import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  
  const baseStyles = "relative font-bold uppercase tracking-wider rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg overflow-hidden group";
  
  const variants = {
    primary: "bg-gradient-to-b from-yellow-400 to-yellow-600 text-black hover:from-yellow-300 hover:to-yellow-500 border-b-4 border-yellow-800 active:border-b-0 active:translate-y-1",
    secondary: "bg-gray-700 text-white hover:bg-gray-600 border-b-4 border-gray-900 active:border-b-0 active:translate-y-1",
    danger: "bg-gradient-to-b from-red-500 to-red-700 text-white hover:from-red-400 hover:to-red-600 border-b-4 border-red-900 active:border-b-0 active:translate-y-1",
    success: "bg-gradient-to-b from-green-500 to-green-700 text-white hover:from-green-400 hover:to-green-600 border-b-4 border-green-900 active:border-b-0 active:translate-y-1",
    outline: "bg-transparent border-2 border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
  };

  const sizes = {
    sm: "py-1 px-3 text-xs",
    md: "py-3 px-6 text-sm",
    lg: "py-4 px-8 text-lg"
  };

  return (
    <button 
      className={`
        ${baseStyles} 
        ${variants[variant]} 
        ${sizes[size]} 
        ${fullWidth ? 'w-full' : ''} 
        ${className}
      `}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
      {/* Shine effect */}
      <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
    </button>
  );
};
