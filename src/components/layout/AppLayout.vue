<template>
  <div
    class="grid h-dvh min-h-[480px] min-w-[960px] grid-cols-[4rem_9.5rem_minmax(0,1fr)_9.5rem] grid-rows-[2.5rem_minmax(0,1fr)] overflow-hidden bg-[#292929] text-zinc-100"
  >
    <header
      class="col-span-4 flex min-w-0 items-center border-b border-zinc-600 bg-[#3a3a3a] px-3"
    >
      <slot name="header">
        <span class="truncate text-sm">Resource pack project name</span>
      </slot>
    </header>

    <aside
      aria-label="Primary navigation"
      class="row-start-2 min-h-0 overflow-y-auto border-r border-zinc-600 bg-[#333333]"
    >
      <slot name="primary-sidebar" />
    </aside>

    <aside
      aria-label="Asset explorer"
      class="row-start-2 min-h-0 overflow-y-auto border-r border-zinc-600 bg-[#3a3a3a]"
    >
      <slot name="asset-explorer" />
    </aside>

    <main
      aria-label="Canvas workspace"
      class="row-start-2 flex min-h-0 min-w-0 overflow-hidden bg-[#292929]"
    >
      <slot name="workspace" />
    </main>

    <aside
      aria-label="Tools and layers"
      class="row-start-2 min-h-0 overflow-y-auto border-l border-zinc-600 bg-[#3a3a3a]"
    >
      <slot name="right-panel" />
    </aside>
  </div>
</template>
