let toastEl: HTMLElement | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/** Show a transient toast inside the Copilot panel. */
export function showToast (message: string, duration = 1400): void {
    const wrapper = document.querySelector('.tabby-copilot-wrapper')
    if (!wrapper) {
        return
    }
    if (!toastEl || !wrapper.contains(toastEl)) {
        toastEl = document.createElement('div')
        toastEl.className = 'copilot-toast'
        wrapper.appendChild(toastEl)
    }
    toastEl.textContent = message
    toastEl.classList.add('visible')
    if (timer) {
        clearTimeout(timer)
    }
    timer = setTimeout(() => toastEl?.classList.remove('visible'), duration)
}
