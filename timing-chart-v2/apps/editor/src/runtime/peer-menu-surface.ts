import { useLayoutEffect, useRef } from "react";

type ActiveMenu = { readonly owner: object; readonly dismiss: () => void };

/** One workspace-wide owner for mutually-exclusive peer menu surfaces. A
 * nested submenu remains part of its parent surface and must not register. */
export class PeerMenuSurfaceCoordinator {
  private active: ActiveMenu | undefined;

  activate(owner: object, dismiss: () => void): void {
    const previous = this.active;
    this.active = { owner, dismiss };
    if (previous && previous.owner !== owner) previous.dismiss();
  }

  release(owner: object): void {
    if (this.active?.owner === owner) this.active = undefined;
  }

  activeOwner(): object | undefined {
    return this.active?.owner;
  }
}

export const peerMenuSurfaceCoordinator = new PeerMenuSurfaceCoordinator();

/** Register a mounted peer menu before paint; activating another peer closes
 * this surface through its own state owner. */
export function usePeerMenuSurface(open: boolean, onDismiss: () => void): void {
  const owner = useRef<object>({});
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const currentOwner = owner.current;
    peerMenuSurfaceCoordinator.activate(currentOwner, () => dismissRef.current());
    return () => peerMenuSurfaceCoordinator.release(currentOwner);
  }, [open]);
}
