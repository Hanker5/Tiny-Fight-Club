class EventEmitter {
    _listeners: Record<string, Function[]> = {};

    on(event: string, fn: Function) {
        (this._listeners[event] ??= []).push(fn);
        return this;
    }

    off(event: string, fn: Function) {
        this._listeners[event] = (this._listeners[event] ?? []).filter(f => f !== fn);
        return this;
    }

    emit(event: string, data?: any) {
        (this._listeners[event] ?? []).forEach(fn => fn(data));
    }
}

// Singleton — import this everywhere instead of creating new instances.
export const emitter = new EventEmitter();
