import { Devvit, Post } from '@devvit/public-api';

// Side effect import to bundle the server. The /index is required for server splitting.
import { defineConfig } from '@devvit/server';
import { postConfigNew } from '../server/core/post';
import '../server/index';

defineConfig({
  name: 'SnooDefense',
  description: 'Can you defend the tower?',
  entry: 'index.html',
  height: 'tall',
  inline: true,
  // TODO: Cannot use without webhooks
  // menu: {
  //   enable: true,
  //   label: 'New TowerBlocks Post',
  //   postTitle: 'TowerBlocks',
  //   preview: <Preview />,
  // },
});

export const Preview: Devvit.BlockComponent<{ text?: string }> = ({ text = 'Loading...' }) => {
  return (
    <zstack width={'100%'} height={'100%'} alignment="center middle">
      <vstack width={'100%'} height={'100%'} alignment="center middle">
        <image
          url="loading.gif"
          description="Loading..."
          height={'140px'}
          width={'140px'}
          imageHeight={'240px'}
          imageWidth={'240px'}
        />
        <spacer size="small" />
        <text maxWidth={`80%`} size="large" weight="bold" alignment="center middle" wrap>
          {text}
        </text>
      </vstack>
    </zstack>
  );
};

// TODO: Remove this when defineConfig allows webhooks before post creation
Devvit.addMenuItem({
  // Please update as you work on your idea!
  label: 'SnooDefense: New Post',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;

    let post: Post | undefined;
    try {
      const subreddit = await reddit.getCurrentSubreddit();
      post = await reddit.submitPost({
        // Title of the post. You'll want to update!
        title: 'SnooDefense',
        subredditName: subreddit.name,
        preview: <Preview />,
      });
      await postConfigNew({
        ctx: context,
        postId: post.id,
      });
      ui.showToast({ text: 'Created post!' });
      ui.navigateTo(post.url);
    } catch (error) {
      if (post) {
        await post.remove(false);
      }
      if (error instanceof Error) {
        ui.showToast({ text: `Error creating post: ${error.message}` });
      } else {
        ui.showToast({ text: 'Error creating post!' });
      }
    }
  },
});

export default Devvit;
