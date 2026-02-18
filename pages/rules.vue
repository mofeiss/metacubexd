<script setup lang="ts">
import type { Rule, RuleProvider } from '~/types'
import { IconFilter, IconReload, IconSearch } from '@tabler/icons-vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { matchSorter } from 'match-sorter'
import {
  useRuleProvidersQuery,
  useRulesQuery,
  useUpdateRuleProviderMutation,
} from '~/composables/useQueries'
import { formatTimeFromNow, useStringBooleanMap } from '~/utils'

const { t, locale } = useI18n()
const mihomoConfigPath = '/opt/mihomo/config.yaml'

interface MihomoConfigResponse {
  content: string
  mtimeMs: number
}

type YamlStatusType = 'success' | 'warning' | 'error'

useHead({ title: computed(() => t('rules')) })

// TanStack Query
const { data: rules = ref([]), isLoading: isLoadingRules } = useRulesQuery()
const { data: ruleProviders = ref([]), isLoading: isLoadingProviders } =
  useRuleProvidersQuery()
const updateProviderMutation = useUpdateRuleProviderMutation()

const activeTab = ref<'rules' | 'ruleProviders'>('rules')
const globalFilter = ref('')

const { map: updatingMap, setWithCallback: setUpdatingMap } =
  useStringBooleanMap()

// Virtual scroll refs
const rulesParentRef = ref<HTMLElement | null>(null)
const providersParentRef = ref<HTMLElement | null>(null)

const tabs = computed(() => [
  {
    type: 'rules' as const,
    name: t('rules'),
    count: rules.value?.length ?? 0,
  },
  {
    type: 'ruleProviders' as const,
    name: t('ruleProviders'),
    count: ruleProviders.value?.length ?? 0,
  },
])

const filteredRules = computed(() =>
  globalFilter.value
    ? matchSorter(rules.value ?? [], globalFilter.value, {
        keys: ['type', 'payload', 'proxy'] as (keyof Rule)[],
      })
    : (rules.value ?? []),
)

const filteredRuleProviders = computed(() =>
  globalFilter.value
    ? matchSorter(ruleProviders.value ?? [], globalFilter.value, {
        keys: ['name', 'vehicleType', 'behavior'] as (keyof RuleProvider)[],
      })
    : (ruleProviders.value ?? []),
)

async function onUpdateProvider(name: string) {
  await setUpdatingMap(name, () => updateProviderMutation.mutateAsync(name))
}

async function onUpdateAllProvider() {
  const providers = ruleProviders.value ?? []
  await Promise.all(
    providers.map((provider) =>
      updateProviderMutation.mutateAsync(provider.name),
    ),
  )
}

const isLoading = computed(
  () => isLoadingRules.value || isLoadingProviders.value,
)
const allProviderIsUpdating = computed(
  () => updateProviderMutation.isPending.value,
)

// Virtual scrollers for rules
const rulesVirtualizerOptions = computed(() => ({
  count: filteredRules.value.length,
  getScrollElement: () => rulesParentRef.value,
  estimateSize: () => 88, // Estimated height of each rule card
  overscan: 5, // Render 5 extra items outside visible area
}))
const rulesVirtualizer = useVirtualizer(rulesVirtualizerOptions)

// Virtual scrollers for rule providers
const providersVirtualizerOptions = computed(() => ({
  count: filteredRuleProviders.value.length,
  getScrollElement: () => providersParentRef.value,
  estimateSize: () => 88, // Estimated height of each provider card
  overscan: 5, // Render 5 extra items outside visible area
}))
const providersVirtualizer = useVirtualizer(providersVirtualizerOptions)

// Computed virtual rows with data
const virtualRulesWithData = computed(() =>
  rulesVirtualizer.value.getVirtualItems().map((virtualRow) => ({
    ...virtualRow,
    data: filteredRules.value[virtualRow.index]!,
  })),
)
const virtualProvidersWithData = computed(() =>
  providersVirtualizer.value.getVirtualItems().map((virtualRow) => ({
    ...virtualRow,
    data: filteredRuleProviders.value[virtualRow.index]!,
  })),
)

// Total sizes for virtual containers
const rulesTotalSize = computed(() => rulesVirtualizer.value.getTotalSize())
const providersTotalSize = computed(() =>
  providersVirtualizer.value.getTotalSize(),
)

const yamlContent = ref('')
const originalYamlContent = ref('')
const yamlMtimeMs = ref<number | null>(null)
const yamlLoading = ref(false)
const yamlSaving = ref(false)
const yamlStatus = ref<{ type: YamlStatusType; message: string } | null>(null)

const isYamlDirty = computed(
  () => yamlContent.value !== originalYamlContent.value,
)
const yamlBytes = computed(
  () => new TextEncoder().encode(yamlContent.value).length,
)
const yamlUpdatedLabel = computed(() =>
  yamlMtimeMs.value ? new Date(yamlMtimeMs.value).toLocaleString() : '--',
)

function parseRequestErrorMessage(error: unknown, fallback: string) {
  const err = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  }

  return (
    err?.data?.statusMessage || err?.statusMessage || err?.message || fallback
  )
}

async function loadMihomoConfigFile() {
  yamlLoading.value = true
  yamlStatus.value = null

  try {
    const result = await $fetch<MihomoConfigResponse>('/api/mihomo-config')
    yamlContent.value = result.content
    originalYamlContent.value = result.content
    yamlMtimeMs.value = result.mtimeMs
  } catch (error) {
    yamlStatus.value = {
      type: 'error',
      message: parseRequestErrorMessage(error, t('yamlEditorLoadFailed')),
    }
  } finally {
    yamlLoading.value = false
  }
}

async function saveMihomoConfigAndReload() {
  if (!isYamlDirty.value) return

  yamlSaving.value = true
  yamlStatus.value = null

  try {
    const saveResult = await $fetch<{ ok: boolean; mtimeMs: number }>(
      '/api/mihomo-config',
      {
        method: 'PUT',
        body: { content: yamlContent.value },
      },
    )

    originalYamlContent.value = yamlContent.value
    yamlMtimeMs.value = saveResult.mtimeMs
  } catch (error) {
    yamlStatus.value = {
      type: 'error',
      message: parseRequestErrorMessage(error, t('yamlEditorSaveFailed')),
    }
    yamlSaving.value = false
    return
  }

  try {
    const request = useRequest()
    await request.put('configs', {
      searchParams: { force: true },
      json: { path: '', payload: '' },
    })

    yamlStatus.value = {
      type: 'success',
      message: t('yamlEditorSaveAndReloadSuccess'),
    }
  } catch (error) {
    yamlStatus.value = {
      type: 'warning',
      message: parseRequestErrorMessage(
        error,
        t('yamlEditorSavedButReloadFailed'),
      ),
    }
  } finally {
    yamlSaving.value = false
  }
}

onMounted(() => {
  loadMihomoConfigFile()
})

onBeforeRouteLeave(() => {
  if (!import.meta.client || !isYamlDirty.value) return true
  return window.confirm(t('yamlEditorUnsavedConfirm'))
})
</script>

<template>
  <div class="rules-page flex h-full flex-col gap-3 overflow-y-auto p-2">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-4">
        <span class="loading loading-lg loading-ring text-primary" />
        <span class="text-sm opacity-60">{{ t('rules') }}</span>
      </div>
    </div>

    <template v-else>
      <!-- YAML Editor -->
      <div
        class="animate-fade-slide-in rounded-xl border border-base-content/8 bg-base-200/60 p-4 backdrop-blur-sm"
      >
        <div
          class="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-base-content/8 pb-3"
        >
          <div class="min-w-0 flex-1">
            <h2 class="text-base leading-[1.2] font-semibold text-base-content">
              {{ t('yamlEditor') }}
            </h2>
            <p class="mt-1 text-xs text-base-content/60">
              {{ t('yamlEditorDescription') }}
            </p>
            <p class="mt-1 font-mono text-xs break-all text-base-content/55">
              {{ t('yamlEditorPath') }}: {{ mihomoConfigPath }}
            </p>
            <p class="mt-1 text-xs text-base-content/55">
              {{ t('updated') }}: {{ yamlUpdatedLabel }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <Button
              class="btn-outline"
              :loading="yamlLoading"
              :disabled="yamlSaving"
              @click="loadMihomoConfigFile"
            >
              {{ t('yamlEditorReloadFile') }}
            </Button>
            <Button
              class="btn-primary"
              :loading="yamlSaving"
              :disabled="yamlLoading || !isYamlDirty"
              @click="saveMihomoConfigAndReload"
            >
              {{ t('yamlEditorSaveAndReload') }}
            </Button>
          </div>
        </div>

        <div
          v-if="yamlStatus"
          class="mb-3 rounded-lg border px-3 py-2 text-sm"
          :class="{
            'border-success/25 bg-success/10 text-success':
              yamlStatus.type === 'success',
            'border-warning/25 bg-warning/10 text-warning':
              yamlStatus.type === 'warning',
            'border-error/25 bg-error/10 text-error':
              yamlStatus.type === 'error',
          }"
        >
          {{ yamlStatus.message }}
        </div>

        <textarea
          v-model="yamlContent"
          class="textarea-bordered textarea h-[320px] w-full font-mono text-sm leading-6"
          :placeholder="t('yamlEditorLoadingHint')"
          :disabled="yamlLoading || yamlSaving"
          spellcheck="false"
        />

        <div
          class="mt-2 flex items-center justify-between text-xs text-base-content/55"
        >
          <span>
            {{
              isYamlDirty ? t('yamlEditorUnsaved') : t('yamlEditorNoChanges')
            }}
          </span>
          <span>{{ t('yamlEditorBytes', { count: yamlBytes }) }}</span>
        </div>
      </div>

      <!-- Header with Tabs and Search -->
      <div class="animate-fade-slide-in flex flex-wrap items-center gap-3">
        <!-- Tabs -->
        <div
          class="flex gap-1 rounded-xl border border-base-content/8 bg-base-200/60 p-1 backdrop-blur-sm"
        >
          <button
            v-for="tab in tabs"
            :key="tab.type"
            class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-base-content/70 transition-all duration-200 hover:bg-base-content/5"
            :class="{
              'bg-primary text-primary-content shadow-[0_2px_8px] shadow-primary/30 hover:bg-primary':
                activeTab === tab.type,
            }"
            @click="activeTab = tab.type"
          >
            <span class="font-medium">{{ tab.name }}</span>
            <span
              class="rounded-md bg-base-content/10 px-1.5 py-0.5 text-xs font-semibold"
              :class="{
                'bg-primary-content/20': activeTab === tab.type,
              }"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

        <!-- Search and Actions -->
        <div class="flex flex-1 items-center gap-2">
          <div
            class="flex flex-1 items-center gap-2 rounded-lg border border-base-content/8 bg-base-200/60 px-3 py-1.5 transition-all duration-200 focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px] focus-within:shadow-primary/10"
          >
            <IconSearch :size="16" class="opacity-50" />
            <input
              v-model="globalFilter"
              class="w-full bg-transparent text-sm outline-none placeholder:opacity-50"
              type="search"
              :placeholder="t('search')"
            />
          </div>

          <Button
            v-if="activeTab === 'ruleProviders'"
            class="flex h-9 w-9 items-center justify-center rounded-[0.625rem] border border-primary/20 bg-primary/10 text-primary transition-all duration-200 hover:bg-primary/20"
            :disabled="allProviderIsUpdating"
            @click="onUpdateAllProvider"
          >
            <IconReload
              :size="18"
              :class="{ 'animate-spin text-success': allProviderIsUpdating }"
            />
          </Button>
        </div>
      </div>

      <!-- Rules List -->
      <div
        v-if="activeTab === 'rules'"
        ref="rulesParentRef"
        class="flex-1 overflow-y-auto"
      >
        <div
          v-if="filteredRules.length === 0"
          class="animate-fade-in flex flex-col items-center justify-center py-16"
        >
          <IconFilter :size="48" class="mb-4 opacity-20" />
          <span class="text-base-content/50">{{ t('noRules') }}</span>
        </div>
        <div
          v-else
          :style="{
            height: `${rulesTotalSize}px`,
            width: '100%',
            position: 'relative',
          }"
        >
          <div
            v-for="(item, index) in virtualRulesWithData"
            :key="`${item.data.type}-${item.data.payload}-${item.data.proxy}`"
            class="pb-2"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }"
          >
            <div
              class="animate-fade-slide-in h-full rounded-xl border border-base-content/8 bg-base-200/60 backdrop-blur-xs transition-all duration-200 hover:border-primary/25 hover:shadow-[0_4px_12px] hover:shadow-primary/8"
              :style="{ animationDelay: `${(index % 10) * 30}ms` }"
            >
              <div class="p-3.5 px-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div
                      class="mb-1 leading-[1.4] font-medium break-all text-base-content"
                    >
                      {{ item.data.payload }}
                    </div>
                    <div
                      class="flex flex-wrap items-center gap-2 text-xs text-base-content/60"
                    >
                      <span
                        class="inline-flex rounded-md bg-primary/15 px-2 py-0.5 font-medium text-primary"
                      >
                        {{ item.data.type }}
                      </span>
                      <span class="opacity-40">-></span>
                      <span
                        class="inline-flex rounded-md bg-secondary/15 px-2 py-0.5 font-medium text-secondary"
                      >
                        {{ item.data.proxy }}
                      </span>
                    </div>
                  </div>
                  <div
                    v-if="item.data.size !== -1"
                    class="inline-flex rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent"
                  >
                    {{ item.data.size }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Rule Providers List -->
      <div v-else ref="providersParentRef" class="flex-1 overflow-y-auto">
        <div
          v-if="filteredRuleProviders.length === 0"
          class="animate-fade-in flex flex-col items-center justify-center py-16"
        >
          <IconFilter :size="48" class="mb-4 opacity-20" />
          <span class="text-base-content/50">{{ t('noRuleProviders') }}</span>
        </div>
        <div
          v-else
          :style="{
            height: `${providersTotalSize}px`,
            width: '100%',
            position: 'relative',
          }"
        >
          <div
            v-for="(item, index) in virtualProvidersWithData"
            :key="`${item.data.name}`"
            class="pb-2"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }"
          >
            <div
              class="animate-fade-slide-in h-full rounded-xl border border-base-content/8 bg-gradient-to-br from-base-200/60 to-secondary/5 backdrop-blur-xs transition-all duration-200 hover:border-primary/25 hover:shadow-[0_4px_12px] hover:shadow-primary/8"
              :style="{ animationDelay: `${(index % 10) * 30}ms` }"
            >
              <div class="p-3.5 px-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div
                      class="mb-1 leading-[1.4] font-medium break-all text-base-content"
                    >
                      {{ item.data.name }}
                    </div>
                    <div
                      class="flex flex-wrap items-center gap-2 text-xs text-base-content/60"
                    >
                      <span
                        class="inline-flex rounded-md bg-primary/15 px-2 py-0.5 font-medium text-primary"
                      >
                        {{ item.data.vehicleType }}
                      </span>
                      <span class="opacity-40">/</span>
                      <span class="opacity-70">
                        {{ item.data.behavior }}
                      </span>
                      <span class="opacity-40">.</span>
                      <span class="opacity-50">
                        {{ t('updated') }}
                        {{ formatTimeFromNow(item.data.updatedAt, locale) }}
                      </span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div
                      class="inline-flex rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent"
                    >
                      {{ item.data.ruleCount }}
                    </div>
                    <Button
                      class="flex h-7 w-7 items-center justify-center rounded-lg border border-base-content/8 bg-base-content/5 transition-all duration-200 hover:border-primary/30 hover:bg-primary/15 hover:text-primary"
                      :disabled="updatingMap[item.data.name]"
                      @click="onUpdateProvider(item.data.name)"
                    >
                      <IconReload
                        :size="16"
                        :class="{
                          'animate-spin text-success':
                            updatingMap[item.data.name],
                        }"
                      />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@keyframes fade-slide-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-fade-slide-in {
  animation: fade-slide-in 0.3s ease-out backwards;
}

.animate-fade-in {
  animation: fade-in 0.4s ease-out;
}
</style>
