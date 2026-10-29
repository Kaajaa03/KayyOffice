interface KayyApi { action(name: string): Promise<string> }
const kayy = (window as unknown as { kayy: KayyApi }).kayy;

const bind = (id: string, action: string, msgId?: string) => {
  document.getElementById(id)!.addEventListener('click', async () => {
    const text = await kayy.action(action);
    if (msgId) document.getElementById(msgId)!.textContent = text;
  });
};

bind('hooks', 'install-hooks', 'm1');
bind('demo', 'demo', 'm2');
bind('close', 'close');
