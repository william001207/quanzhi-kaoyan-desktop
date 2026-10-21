/**
 * 本地替身：@lark-apaas/client-toolkit/components/UniversalLink
 * 应用内跳转用 router 的 Link；带 target="_blank" 时降级成普通 a 标签。
 */
import React from 'react';
import { Link } from 'react-router-dom';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  children?: React.ReactNode;
};

export function UniversalLink({ to, children, target, ...rest }: Props) {
  if (target === '_blank') {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} {...(rest as any)}>
      {children}
    </Link>
  );
}

export default UniversalLink;
