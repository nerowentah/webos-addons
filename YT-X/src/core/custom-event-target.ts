type TypedEventPartial<T extends EventTarget, U> = {
  readonly currentTarget: T | null;
  readonly type: U;
};

type BaseTypedEvent<T extends EventTarget, E extends Event, U> = E &
  TypedEventPartial<T, U>;

type TypedEvent<T extends EventTarget, U> = BaseTypedEvent<T, Event, U>;

export type TypedCustomEvent<
  D,
  T extends EventTarget,
  U = string
> = BaseTypedEvent<T, CustomEvent<D>, U>;

export const TypedCustomEvent = CustomEvent as {
  new <const U extends string, const D = undefined>(
    type: U,
    eventInitDict?: CustomEventInit<D>
  ): TypedCustomEvent<D, EventTarget, U>;

  prototype: BaseTypedEvent<EventTarget, CustomEvent<unknown>, string>;
};

// Event maps may be any user-defined interface shape (which, unlike a Record
// bound, need no index signature), so the bound is just "an object".
type EventMapValue<
  T extends object,
  K extends keyof T & string
> = T[K] extends Event ? T[K] : never;

/** Any event the map describes, tagged with its own name so `type` and payload cannot disagree. */
type DispatchableEvent<T extends object> = {
  [K in keyof T & string]: EventMapValue<T, K> & { readonly type: K };
}[keyof T & string];

interface TypedEventListener<
  Self extends EventTarget,
  T extends object,
  EventName extends keyof T
> {
  (this: Self, evt: T[EventName] & TypedEvent<Self, EventName>): void;
}

// Per the DOM, handleEvent is invoked with `this` bound to the listener object itself, not the target.
interface TypedEventListenerObject<
  Self extends EventTarget,
  T extends object,
  EventName extends keyof T
> {
  handleEvent(evt: T[EventName] & TypedEvent<Self, EventName>): void;
}

type TypedEventListenerArg<
  Self extends EventTarget,
  T extends object,
  EventName extends keyof T
> =
  | TypedEventListener<Self, T, EventName>
  | TypedEventListenerObject<Self, T, EventName>
  | null;

interface CustomEventTarget<T extends object> {
  addEventListener<K extends keyof T & string>(
    type: K,
    callback: TypedEventListenerArg<this, T, K>,
    options?: boolean | AddEventListenerOptions
  ): void;

  removeEventListener<K extends keyof T & string>(
    type: K,
    callback: TypedEventListenerArg<this, T, K>,
    options?: boolean | EventListenerOptions
  ): void;

  dispatchEvent(event: DispatchableEvent<T>): boolean;
}

export const CustomEventTarget = EventTarget as {
  new <T extends object>(): CustomEventTarget<T>;
  prototype: CustomEventTarget<object>;
};

export type EventMapOf<T> =
  T extends CustomEventTarget<infer U>
    ? { [K in keyof U]: U[K] & TypedEvent<T, K> }
    : never;
