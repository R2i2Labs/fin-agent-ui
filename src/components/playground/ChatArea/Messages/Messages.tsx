/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlaygroundChatMessage } from '@/types/playground'
import { AgentMessage, UserMessage } from './MessageItem'
import Tooltip from '@/components/ui/tooltip'
import { memo, useState } from 'react'
import {
  ToolCallProps,
  ReasoningStepProps,
  ReasoningProps,
  ReferenceData,
  Reference
} from '@/types/playground'
import React, { type FC } from 'react'
import ChatBlankState from './ChatBlankState'
import Icon from '@/components/ui/icon'

// Modal component for displaying tool results
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

const Modal: FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[80vh] w-[80vw] max-w-3xl overflow-auto rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-lg font-medium">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-background-secondary">
            <Icon type="x" size="sm" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

interface MessageListProps {
  messages: PlaygroundChatMessage[]
}

interface MessageWrapperProps {
  message: PlaygroundChatMessage
  isLastMessage: boolean
}

interface ReferenceProps {
  references: ReferenceData[]
}

interface ReferenceItemProps {
  reference: Reference
}

interface ToolResult {
  tool: string
  arguments: Record<string, any>
  result: Record<string, any>
}

const ReferenceItem: FC<ReferenceItemProps> = ({ reference }) => (
  <div className="relative flex h-[63px] w-[190px] cursor-default flex-col justify-between overflow-hidden rounded-md bg-background-secondary p-3 transition-colors hover:bg-background-secondary/80">
    <p className="text-sm font-medium text-primary">{reference.name}</p>
    <p className="truncate text-xs text-primary/40">{reference.content}</p>
  </div>
)

const References: FC<ReferenceProps> = ({ references }) => (
  <div className="flex flex-col gap-4">
    {references.map((referenceData, index) => (
      <div
        key={`${referenceData.query}-${index}`}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap gap-3">
          {referenceData.references.map((reference, refIndex) => (
            <ReferenceItem
              key={`${reference.name}-${reference.meta_data.chunk}-${refIndex}`}
              reference={reference}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
)

const ToolResultCard: FC<{ toolResult: ToolResult; onClick: () => void }> = ({ toolResult, onClick }) => {
  // Get status from result if available
  const status = toolResult.result?.status || 'executed'
  const statusColor = status === 'success' ? 'text-green-500' : status === 'error' ? 'text-red-500' : 'text-yellow-500'

  return (
    <div
      onClick={onClick}
      className="flex flex-col cursor-pointer rounded-lg bg-background-secondary p-4 hover:bg-background-secondary/80 transition-colors w-64 h-32 shadow-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon type="hammer" size="sm" color="secondary" />
          <h3 className="font-medium text-primary">{toolResult.tool}</h3>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full bg-background ${statusColor}`}>
          {status}
        </span>
      </div>

      <div className="text-xs text-secondary mt-2 overflow-hidden">
        {Object.keys(toolResult.arguments).length > 0 ? (
          <div className="truncate">
            <span className="font-medium">Args:</span> {JSON.stringify(toolResult.arguments).slice(0, 50)}
            {JSON.stringify(toolResult.arguments).length > 50 ? '...' : ''}
          </div>
        ) : (
          <div className="text-secondary/60">No arguments</div>
        )}
      </div>

      <div className="mt-auto text-xs text-secondary/80 italic">
        Click to view full result
      </div>
    </div>
  )
}

const ToolResultViewer: FC<{ toolResults: ToolResult[] }> = ({ toolResults }) => {
  const [selectedTool, setSelectedTool] = useState<ToolResult | null>(null)

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {toolResults.map((toolResult, index) => (
          <ToolResultCard
            key={`${toolResult.tool}-${index}`}
            toolResult={toolResult}
            onClick={() => setSelectedTool(toolResult)}
          />
        ))}
      </div>

      <Modal
        isOpen={!!selectedTool}
        onClose={() => setSelectedTool(null)}
        title={selectedTool?.tool || 'Tool Result'}
      >
        <div className="flex flex-col gap-4">
          {selectedTool && (
            <>
              <div className="flex flex-col gap-2">
                <h4 className="font-medium text-primary">Arguments</h4>
                <div className="rounded-md bg-background-secondary p-4 overflow-auto">
                  <pre className="text-xs text-secondary font-dmmono">
                    {JSON.stringify(selectedTool.arguments, null, 2) || '{}'}
                  </pre>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="font-medium text-primary">Result</h4>
                <div className="rounded-md bg-background-secondary p-4 overflow-auto max-h-[50vh]">
                  <pre className="text-xs text-secondary font-dmmono">
                    {JSON.stringify(selectedTool.result, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

const AgentMessageWrapper = ({ message }: MessageWrapperProps) => {
  return (
    <div className="flex flex-col gap-y-9">
      {message.extra_data?.reasoning_steps &&
        message.extra_data.reasoning_steps.length > 0 && (
          <div className="flex items-start gap-4">
            <Tooltip
              delayDuration={0}
              content={<p className="text-accent">Reasoning</p>}
              side="top"
            >
              <Icon type="reasoning" size="sm" />
            </Tooltip>
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase">Reasoning</p>
              <Reasonings reasoning={message.extra_data.reasoning_steps} />
            </div>
          </div>
        )}

      {message.extra_data?.references &&
        message.extra_data.references.length > 0 && (
          <div className="flex items-start gap-4">
            <Tooltip
              delayDuration={0}
              content={<p className="text-accent">References</p>}
              side="top"
            >
              <Icon type="references" size="sm" />
            </Tooltip>
            <div className="flex flex-col gap-3">
              <References references={message.extra_data.references} />
            </div>
          </div>
        )}

      {message.tool_results && message.tool_results.length > 0 && (
        <div className="flex items-start gap-4">
          <Tooltip
            delayDuration={0}
            content={<p className="text-accent">Tool Calls</p>}
            side="top"
          >
            <Icon type="hammer" size="sm" />
          </Tooltip>
          <div className="flex flex-col gap-3 w-full">
            <p className="text-xs uppercase">Tool Calls</p>
            <ToolResultViewer toolResults={message.tool_results} />
          </div>
        </div>
      )}

      <AgentMessage message={message} />
    </div>
  )
}

const Reasoning: FC<ReasoningStepProps> = ({ index, stepTitle }) => (
  <div className="flex items-center gap-2 text-secondary">
    <div className="flex h-[20px] items-center rounded-md bg-background-secondary p-2">
      <p className="text-xs">STEP {index + 1}</p>
    </div>
    <p className="text-xs">{stepTitle}</p>
  </div>
)

const Reasonings: FC<ReasoningProps> = ({ reasoning }) => (
  <div className="flex flex-col items-start justify-center gap-2">
    {reasoning.map((title, index) => (
      <Reasoning
        key={`${title.title}-${title.action}`}
        stepTitle={title.title}
        index={index}
      />
    ))}
  </div>
)

const ToolComponent = memo(({ tools }: ToolCallProps) => (
  <div className="cursor-default rounded-full bg-accent px-2 py-1.5 text-xs">
    <p className="font-dmmono uppercase text-primary/80">{tools.tool_name}</p>
  </div>
))
ToolComponent.displayName = 'ToolComponent'

const Messages = ({ messages }: MessageListProps) => {
  if (messages.length === 0) {
    return <ChatBlankState />
  }

  return (
    <>
      {messages.map((message, index) => {
        const key = `${message.role}-${message.created_at}-${index}`
        const isLastMessage = index === messages.length - 1

        if (message.role === 'agent') {
          return (
            <AgentMessageWrapper
              key={key}
              message={message}
              isLastMessage={isLastMessage}
            />
          )
        }
        return <UserMessage key={key} message={message} />
      })}
    </>
  )
}

export default Messages