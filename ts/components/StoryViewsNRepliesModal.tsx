// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import classNames from 'classnames';
import { usePopper } from 'react-popper';
import { noop } from 'lodash';

import type { AttachmentType } from '../types/Attachment';
import type { DraftBodyRangesType, LocalizerType } from '../types/Util';
import type { ConversationType } from '../state/ducks/conversations';
import type { EmojiPickDataType } from './emoji/EmojiPicker';
import type { InputApi } from './CompositionInput';
import type { PreferredBadgeSelectorType } from '../state/selectors/badges';
import type { RenderEmojiPickerProps } from './conversation/ReactionPicker';
import type { ReplyType, StorySendStateType } from '../types/Stories';
import { StoryViewTargetType } from '../types/Stories';
import { Avatar, AvatarSize } from './Avatar';
import { CompositionInput } from './CompositionInput';
import { ContactName } from './conversation/ContactName';
import { EmojiButton } from './emoji/EmojiButton';
import { Emojify } from './conversation/Emojify';
import { Message, TextDirection } from './conversation/Message';
import { MessageTimestamp } from './conversation/MessageTimestamp';
import { Modal } from './Modal';
import { Quote } from './conversation/Quote';
import { ReactionPicker } from './conversation/ReactionPicker';
import { Tabs } from './Tabs';
import { Theme } from '../util/theme';
import { ThemeType } from '../types/Util';
import { WidthBreakpoint } from './_util';
import { getAvatarColor } from '../types/Colors';
import { getStoryReplyText } from '../util/getStoryReplyText';
import { shouldNeverBeCalled } from '../util/shouldNeverBeCalled';
import { ContextMenu } from './ContextMenu';
import { ConfirmationDialog } from './ConfirmationDialog';

// Menu is disabled so these actions are inaccessible. We also don't support
// link previews, tap to view messages, attachments, or gifts. Just regular
// text messages and reactions.
const MESSAGE_DEFAULT_PROPS = {
  canDeleteForEveryone: false,
  checkForAccount: shouldNeverBeCalled,
  clearSelectedMessage: shouldNeverBeCalled,
  containerWidthBreakpoint: WidthBreakpoint.Medium,
  displayTapToViewMessage: shouldNeverBeCalled,
  doubleCheckMissingQuoteReference: shouldNeverBeCalled,
  downloadAttachment: shouldNeverBeCalled,
  isBlocked: false,
  isMessageRequestAccepted: true,
  kickOffAttachmentDownload: shouldNeverBeCalled,
  markAttachmentAsCorrupted: shouldNeverBeCalled,
  markViewed: shouldNeverBeCalled,
  messageExpanded: shouldNeverBeCalled,
  // Called when clicking mention, but shouldn't do anything.
  openConversation: noop,
  openGiftBadge: shouldNeverBeCalled,
  openLink: shouldNeverBeCalled,
  previews: [],
  renderAudioAttachment: () => <div />,
  scrollToQuotedMessage: shouldNeverBeCalled,
  showContactDetail: shouldNeverBeCalled,
  showContactModal: shouldNeverBeCalled,
  showExpiredIncomingTapToViewToast: shouldNeverBeCalled,
  showExpiredOutgoingTapToViewToast: shouldNeverBeCalled,
  showMessageDetail: shouldNeverBeCalled,
  showVisualAttachment: shouldNeverBeCalled,
  startConversation: shouldNeverBeCalled,
  theme: ThemeType.dark,
  viewStory: shouldNeverBeCalled,
};

export enum StoryViewsNRepliesTab {
  Replies = 'Replies',
  Views = 'Views',
}

export type PropsType = {
  authorTitle: string;
  canReply: boolean;
  getPreferredBadge: PreferredBadgeSelectorType;
  hasViewReceiptSetting: boolean;
  hasViewsCapability: boolean;
  i18n: LocalizerType;
  group: Pick<ConversationType, 'left'> | undefined;
  onClose: () => unknown;
  onReact: (emoji: string) => unknown;
  onReply: (
    message: string,
    mentions: DraftBodyRangesType,
    timestamp: number
  ) => unknown;
  onSetSkinTone: (tone: number) => unknown;
  onTextTooLong: () => unknown;
  onUseEmoji: (_: EmojiPickDataType) => unknown;
  preferredReactionEmoji: Array<string>;
  recentEmojis?: Array<string>;
  renderEmojiPicker: (props: RenderEmojiPickerProps) => JSX.Element;
  replies: ReadonlyArray<ReplyType>;
  skinTone?: number;
  sortedGroupMembers?: Array<ConversationType>;
  storyPreviewAttachment?: AttachmentType;
  views: Array<StorySendStateType>;
  viewTarget: StoryViewTargetType;
  onChangeViewTarget: (target: StoryViewTargetType) => unknown;
  deleteGroupStoryReply: (id: string) => void;
  deleteGroupStoryReplyForEveryone: (id: string) => void;
};

export const StoryViewsNRepliesModal = ({
  authorTitle,
  canReply,
  getPreferredBadge,
  hasViewReceiptSetting,
  hasViewsCapability,
  i18n,
  group,
  onClose,
  onReact,
  onReply,
  onSetSkinTone,
  onTextTooLong,
  onUseEmoji,
  preferredReactionEmoji,
  recentEmojis,
  renderEmojiPicker,
  replies,
  skinTone,
  sortedGroupMembers,
  storyPreviewAttachment,
  views,
  viewTarget,
  onChangeViewTarget,
  deleteGroupStoryReply,
  deleteGroupStoryReplyForEveryone,
}: PropsType): JSX.Element | null => {
  const [deleteReplyId, setDeleteReplyId] = useState<string | undefined>(
    undefined
  );
  const [deleteForEveryoneReplyId, setDeleteForEveryoneReplyId] = useState<
    string | undefined
  >(undefined);

  const containerElementRef = useRef<HTMLDivElement | null>(null);
  const inputApiRef = useRef<InputApi | undefined>();
  const shouldScrollToBottomRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messageBodyText, setMessageBodyText] = useState('');
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const currentTab = useMemo<StoryViewsNRepliesTab>(() => {
    return viewTarget === StoryViewTargetType.Replies
      ? StoryViewsNRepliesTab.Replies
      : StoryViewsNRepliesTab.Views;
  }, [viewTarget]);

  const onTabChange = (tab: string) => {
    onChangeViewTarget(
      tab === StoryViewsNRepliesTab.Replies
        ? StoryViewTargetType.Replies
        : StoryViewTargetType.Views
    );
  };

  const focusComposer = useCallback(() => {
    if (inputApiRef.current) {
      inputApiRef.current.focus();
    }
  }, [inputApiRef]);

  const insertEmoji = useCallback(
    (e: EmojiPickDataType) => {
      if (inputApiRef.current) {
        inputApiRef.current.insertEmoji(e);
        onUseEmoji(e);
      }
    },
    [inputApiRef, onUseEmoji]
  );

  const [referenceElement, setReferenceElement] =
    useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(
    null
  );

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: 'top-start',
    strategy: 'fixed',
  });

  let composerElement: JSX.Element | undefined;

  useLayoutEffect(() => {
    if (
      currentTab === StoryViewsNRepliesTab.Replies &&
      replies.length &&
      shouldScrollToBottomRef.current
    ) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      shouldScrollToBottomRef.current = false;
    }
  }, [currentTab, replies.length]);

  if (group && group.left) {
    composerElement = (
      <div className="StoryViewsNRepliesModal__not-a-member">
        {i18n('icu:StoryViewsNRepliesModal__not-a-member')}
      </div>
    );
  } else if (canReply) {
    composerElement = (
      <>
        {!group && (
          <Quote
            authorTitle={authorTitle}
            conversationColor="ultramarine"
            i18n={i18n}
            isFromMe={false}
            isGiftBadge={false}
            isStoryReply
            isViewOnce={false}
            moduleClassName="StoryViewsNRepliesModal__quote"
            rawAttachment={storyPreviewAttachment}
            referencedMessageNotFound={false}
            text={getStoryReplyText(i18n, storyPreviewAttachment)}
          />
        )}
        <div className="StoryViewsNRepliesModal__compose-container">
          <div className="StoryViewsNRepliesModal__composer">
            <CompositionInput
              draftText={messageBodyText}
              getPreferredBadge={getPreferredBadge}
              i18n={i18n}
              inputApi={inputApiRef}
              moduleClassName="StoryViewsNRepliesModal__input"
              onEditorStateChange={messageText => {
                setMessageBodyText(messageText);
              }}
              onPickEmoji={onUseEmoji}
              onSubmit={(...args) => {
                inputApiRef.current?.reset();
                shouldScrollToBottomRef.current = true;
                onReply(...args);
              }}
              onTextTooLong={onTextTooLong}
              placeholder={
                group
                  ? i18n('StoryViewer__reply-group')
                  : i18n('StoryViewer__reply')
              }
              sortedGroupMembers={sortedGroupMembers}
              theme={ThemeType.dark}
            >
              <EmojiButton
                className="StoryViewsNRepliesModal__emoji-button"
                i18n={i18n}
                onPickEmoji={insertEmoji}
                onClose={focusComposer}
                recentEmojis={recentEmojis}
                skinTone={skinTone}
                onSetSkinTone={onSetSkinTone}
              />
            </CompositionInput>
          </div>
          <button
            aria-label={i18n('StoryViewsNRepliesModal__react')}
            className="StoryViewsNRepliesModal__react"
            onClick={() => {
              setShowReactionPicker(!showReactionPicker);
            }}
            ref={setReferenceElement}
            type="button"
          />
          {showReactionPicker && (
            <div
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
            >
              <ReactionPicker
                i18n={i18n}
                onClose={() => {
                  setShowReactionPicker(false);
                }}
                onPick={emoji => {
                  setShowReactionPicker(false);
                  onReact(emoji);
                }}
                onSetSkinTone={onSetSkinTone}
                preferredReactionEmoji={preferredReactionEmoji}
                renderEmojiPicker={renderEmojiPicker}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  let repliesElement: JSX.Element | undefined;

  function shouldCollapse(reply: ReplyType, otherReply?: ReplyType) {
    // deleted reactions get rendered the same as deleted replies
    return (
      reply.conversationId === otherReply?.conversationId &&
      (!otherReply?.reactionEmoji || Boolean(otherReply.deletedForEveryone))
    );
  }

  if (replies.length) {
    repliesElement = (
      <div
        className="StoryViewsNRepliesModal__replies"
        ref={containerElementRef}
      >
        {replies.map((reply, index) => {
          return (
            <ReplyOrReactionMessage
              key={reply.id}
              i18n={i18n}
              reply={reply}
              deleteGroupStoryReply={() => setDeleteReplyId(reply.id)}
              deleteGroupStoryReplyForEveryone={() =>
                setDeleteForEveryoneReplyId(reply.id)
              }
              getPreferredBadge={getPreferredBadge}
              shouldCollapseAbove={shouldCollapse(reply, replies[index - 1])}
              shouldCollapseBelow={shouldCollapse(reply, replies[index + 1])}
              containerElementRef={containerElementRef}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    );
  } else if (group) {
    repliesElement = (
      <div className="StoryViewsNRepliesModal__replies--none">
        {i18n('StoryViewsNRepliesModal__no-replies')}
      </div>
    );
  }

  let viewsElement: JSX.Element | undefined;
  if (hasViewsCapability && !hasViewReceiptSetting) {
    viewsElement = (
      <div className="StoryViewsNRepliesModal__read-receipts-off">
        {i18n('StoryViewsNRepliesModal__read-receipts-off')}
      </div>
    );
  } else if (views.length) {
    viewsElement = (
      <div className="StoryViewsNRepliesModal__views">
        {views.map(view => (
          <div
            className="StoryViewsNRepliesModal__view"
            key={view.recipient.id}
          >
            <div>
              <Avatar
                acceptedMessageRequest={view.recipient.acceptedMessageRequest}
                avatarPath={view.recipient.avatarPath}
                badge={undefined}
                color={getAvatarColor(view.recipient.color)}
                conversationType="direct"
                i18n={i18n}
                isMe={Boolean(view.recipient.isMe)}
                profileName={view.recipient.profileName}
                sharedGroupNames={view.recipient.sharedGroupNames || []}
                size={AvatarSize.TWENTY_EIGHT}
                title={view.recipient.title}
              />
              <span className="StoryViewsNRepliesModal__view--name">
                <ContactName title={view.recipient.title} />
              </span>
            </div>
            {view.updatedAt && (
              <MessageTimestamp
                i18n={i18n}
                module="StoryViewsNRepliesModal__view--timestamp"
                timestamp={view.updatedAt}
              />
            )}
          </div>
        ))}
      </div>
    );
  } else if (hasViewsCapability) {
    viewsElement = (
      <div className="StoryViewsNRepliesModal__replies--none">
        {i18n('StoryViewsNRepliesModal__no-views')}
      </div>
    );
  }

  const tabsElement =
    viewsElement && repliesElement ? (
      <Tabs
        selectedTab={currentTab}
        onTabChange={onTabChange}
        moduleClassName="StoryViewsNRepliesModal__tabs"
        tabs={[
          {
            id: StoryViewsNRepliesTab.Views,
            label: i18n('StoryViewsNRepliesModal__tab--views'),
          },
          {
            id: StoryViewsNRepliesTab.Replies,
            label: i18n('StoryViewsNRepliesModal__tab--replies'),
          },
        ]}
      >
        {({ selectedTab }) => (
          <>
            {selectedTab === StoryViewsNRepliesTab.Views && viewsElement}
            {selectedTab === StoryViewsNRepliesTab.Replies && (
              <>
                {repliesElement}
                {composerElement}
              </>
            )}
          </>
        )}
      </Tabs>
    ) : undefined;

  if (!tabsElement && !viewsElement && !repliesElement && !composerElement) {
    return null;
  }

  return (
    <>
      <Modal
        modalName="StoryViewsNRepliesModal"
        i18n={i18n}
        moduleClassName="StoryViewsNRepliesModal"
        onClose={onClose}
        useFocusTrap={Boolean(composerElement)}
        theme={Theme.Dark}
      >
        <div
          className={classNames({
            'StoryViewsNRepliesModal--group': Boolean(group),
          })}
        >
          {tabsElement || (
            <>
              {viewsElement || repliesElement}
              {composerElement}
            </>
          )}
        </div>
      </Modal>
      {deleteReplyId && (
        <ConfirmationDialog
          i18n={i18n}
          theme={Theme.Dark}
          dialogName="confirmDialog"
          actions={[
            {
              text: i18n('delete'),
              action: () => deleteGroupStoryReply(deleteReplyId),
              style: 'negative',
            },
          ]}
          title={i18n('deleteWarning')}
          onClose={() => setDeleteReplyId(undefined)}
          onCancel={() => setDeleteReplyId(undefined)}
        />
      )}
      {deleteForEveryoneReplyId && (
        <ConfirmationDialog
          i18n={i18n}
          theme={Theme.Dark}
          dialogName="confirmDialog"
          actions={[
            {
              text: i18n('delete'),
              action: () =>
                deleteGroupStoryReplyForEveryone(deleteForEveryoneReplyId),
              style: 'negative',
            },
          ]}
          title={i18n('deleteWarning')}
          onClose={() => setDeleteForEveryoneReplyId(undefined)}
          onCancel={() => setDeleteForEveryoneReplyId(undefined)}
        >
          {i18n('deleteForEveryoneWarning')}
        </ConfirmationDialog>
      )}
    </>
  );
};

type ReplyOrReactionMessageProps = {
  i18n: LocalizerType;
  reply: ReplyType;
  deleteGroupStoryReply: (replyId: string) => void;
  deleteGroupStoryReplyForEveryone: (replyId: string) => void;
  getPreferredBadge: PreferredBadgeSelectorType;
  shouldCollapseAbove: boolean;
  shouldCollapseBelow: boolean;
  containerElementRef: React.RefObject<HTMLElement>;
  onContextMenu?: (ev: React.MouseEvent) => void;
};

const ReplyOrReactionMessage = ({
  i18n,
  reply,
  deleteGroupStoryReply,
  deleteGroupStoryReplyForEveryone,
  containerElementRef,
  getPreferredBadge,
  shouldCollapseAbove,
  shouldCollapseBelow,
}: ReplyOrReactionMessageProps) => {
  const renderContent = (onContextMenu?: (ev: React.MouseEvent) => void) => {
    if (reply.reactionEmoji && !reply.deletedForEveryone) {
      return (
        <div
          className="StoryViewsNRepliesModal__reaction"
          onContextMenu={onContextMenu}
        >
          <div className="StoryViewsNRepliesModal__reaction--container">
            <Avatar
              acceptedMessageRequest={reply.author.acceptedMessageRequest}
              avatarPath={reply.author.avatarPath}
              badge={getPreferredBadge(reply.author.badges)}
              color={getAvatarColor(reply.author.color)}
              conversationType="direct"
              i18n={i18n}
              isMe={Boolean(reply.author.isMe)}
              profileName={reply.author.profileName}
              sharedGroupNames={reply.author.sharedGroupNames || []}
              size={AvatarSize.TWENTY_EIGHT}
              theme={ThemeType.dark}
              title={reply.author.title}
            />
            <div className="StoryViewsNRepliesModal__reaction--body">
              <div className="StoryViewsNRepliesModal__reply--title">
                <ContactName
                  contactNameColor={reply.contactNameColor}
                  title={reply.author.isMe ? i18n('you') : reply.author.title}
                />
              </div>
              {i18n('StoryViewsNRepliesModal__reacted')}
              <MessageTimestamp
                i18n={i18n}
                isRelativeTime
                module="StoryViewsNRepliesModal__reply--timestamp"
                timestamp={reply.timestamp}
              />
            </div>
          </div>
          <Emojify text={reply.reactionEmoji} />
        </div>
      );
    }

    return (
      <Message
        {...MESSAGE_DEFAULT_PROPS}
        author={reply.author}
        bodyRanges={reply.bodyRanges}
        contactNameColor={reply.contactNameColor}
        containerElementRef={containerElementRef}
        conversationColor="ultramarine"
        conversationId={reply.conversationId}
        conversationTitle={reply.author.title}
        conversationType="group"
        direction="incoming"
        deletedForEveryone={reply.deletedForEveryone}
        menu={undefined}
        onContextMenu={onContextMenu}
        getPreferredBadge={getPreferredBadge}
        i18n={i18n}
        id={reply.id}
        interactionMode="mouse"
        readStatus={reply.readStatus}
        renderingContext="StoryViewsNRepliesModal"
        shouldCollapseAbove={shouldCollapseAbove}
        shouldCollapseBelow={shouldCollapseBelow}
        shouldHideMetadata={false}
        text={reply.body}
        textDirection={TextDirection.Default}
        timestamp={reply.timestamp}
      />
    );
  };

  return reply.author.isMe && !reply.deletedForEveryone ? (
    <ContextMenu
      i18n={i18n}
      key={reply.id}
      menuOptions={[
        {
          icon: 'module-message__context--icon module-message__context__delete-message',
          label: i18n('icu:StoryViewsNRepliesModal__delete-reply'),
          onClick: () => deleteGroupStoryReply(reply.id),
        },
        {
          icon: 'module-message__context--icon module-message__context__delete-message-for-everyone',
          label: i18n('icu:StoryViewsNRepliesModal__delete-reply-for-everyone'),
          onClick: () => deleteGroupStoryReplyForEveryone(reply.id),
        },
      ]}
    >
      {({ openMenu, menuNode }) => (
        <>
          {renderContent(openMenu)}
          {menuNode}
        </>
      )}
    </ContextMenu>
  ) : (
    renderContent()
  );
};
