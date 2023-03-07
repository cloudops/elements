import { isHttpOperation, isHttpService, TableOfContentsItem } from '@stoplight/elements-core';
import { NodeType } from '@stoplight/types';
import { defaults } from 'lodash';

import { OperationNode, ServiceChildNode, ServiceNode } from '../../utils/oas/types';

export type TagGroup = { title: string; items: OperationNode[]; tagGroups: string };

export const computeTagGroups = (serviceNode: ServiceNode) => {
  const groupsByTagId: { [tagId: string]: TagGroup } = {};
  const ungrouped = [];

  const lowerCaseServiceTags = serviceNode.tags.map(tn => tn.toLowerCase());

  for (const node of serviceNode.children) {
    if (node.type !== NodeType.HttpOperation) continue;
    const tagName = node.tags[0];

    if (tagName) {
      const tagId = tagName.toLowerCase();
      if (groupsByTagId[tagId]) {
        groupsByTagId[tagId].items.push(node);
      } else {
        const serviceTagIndex = lowerCaseServiceTags.findIndex(tn => tn === tagId);
        const serviceTagName = serviceNode.tags[serviceTagIndex];
        groupsByTagId[tagId] = {
          title: serviceTagName || tagName,
          items: [node],
          tagGroups: '',
        };
      }
      const tagGroups = node.extensions['x-tagGroups'] as string;
      if (tagGroups) {
        groupsByTagId[tagId].tagGroups = tagGroups;
      }
    } else {
      ungrouped.push(node);
    }
  }

  const orderedTagGroups = Object.entries(groupsByTagId)
    .sort(([g1], [g2]) => {
      const g1LC = g1.toLowerCase();
      const g2LC = g2.toLowerCase();
      const g1Idx = lowerCaseServiceTags.findIndex(tn => tn === g1LC);
      const g2Idx = lowerCaseServiceTags.findIndex(tn => tn === g2LC);

      // Move not-tagged groups to the bottom
      if (g1Idx < 0 && g2Idx < 0) return 0;
      if (g1Idx < 0) return 1;
      if (g2Idx < 0) return -1;

      // sort tagged groups according to the order found in HttpService
      return g1Idx - g2Idx;
    })
    .map(([, tagGroup]) => tagGroup);

  return { groups: orderedTagGroups, ungrouped };
};

interface ComputeAPITreeConfig {
  hideSchemas?: boolean;
  hideInternal?: boolean;
}

const defaultComputerAPITreeConfig = {
  hideSchemas: false,
  hideInternal: false,
};

export const computeAPITree = (serviceNode: ServiceNode, config: ComputeAPITreeConfig = {}) => {
  const mergedConfig = defaults(config, defaultComputerAPITreeConfig);
  const tree: TableOfContentsItem[] = [];

  tree.push({
    id: '/',
    slug: '/',
    title: 'Overview',
    type: 'overview',
    meta: '',
  });

  const operationNodes = serviceNode.children.filter(node => node.type === NodeType.HttpOperation);
  const categoriesMap: { [key: string]: TableOfContentsItem[] } = {};
  let categoriesOrder: string[] = [];

  if (operationNodes.length) {
    const { groups, ungrouped } = computeTagGroups(serviceNode);

    // Show ungroupped operations above tag groups
    ungrouped.forEach(operationNode => {
      if (mergedConfig.hideInternal && operationNode.data.internal) {
        return;
      }
      const category = (operationNode.extensions['x-tagsGroup'] as string) || 'Endpoints';
      if (!categoriesMap[category]) {
        categoriesMap[category] = [];
      }
      categoriesMap[category].push({
        id: operationNode.uri,
        slug: operationNode.uri,
        title: operationNode.name,
        type: operationNode.type,
        meta: operationNode.data.method,
        description: operationNode.data.description || '',
      });
      if (!categoriesOrder.includes(category)) {
        categoriesOrder.push(category);
      }
    });

    groups.forEach(group => {
      const items = group.items.flatMap(operationNode => {
        if (mergedConfig.hideInternal && operationNode.data.internal) {
          return [];
        }
        const category = group.tagGroups || 'Endpoints';
        return {
          category,
          item: {
            id: operationNode.uri,
            slug: operationNode.uri,
            title: operationNode.name,
            type: operationNode.type,
            meta: operationNode.data.method,
            description: operationNode.data.description || '',
          },
        };
      });

      if (items.length > 0) {
        items.forEach(i => {
          if (!categoriesMap[i.category]) {
            categoriesMap[i.category] = [];
          }
        });
        const category = items.map(i => i.category).filter(c => c)[0];
        categoriesMap[category].push({
          title: group.title,
          items: items.map(i => i.item),
        });
        if (!categoriesOrder.includes(category)) {
          categoriesOrder.push(category);
        }
      }
    });
  }
  categoriesOrder = categoriesOrder.filter(c => c !== 'Endpoints');
  categoriesOrder.push('Endpoints');
  Object.entries(categoriesMap)
    .sort((a, b) => categoriesOrder.indexOf(a[0]) - categoriesOrder.indexOf(b[0]))
    .forEach(e => {
      tree.push({
        title: e[0],
      });
      e[1].forEach(a => tree.push(a));
    });

  let schemaNodes = serviceNode.children.filter(node => node.type === NodeType.Model);
  if (mergedConfig.hideInternal) {
    schemaNodes = schemaNodes.filter(node => !node.data['x-internal']);
  }

  if (!mergedConfig.hideSchemas && schemaNodes.length) {
    tree.push({
      title: 'Schemas',
    });

    schemaNodes.forEach(node => {
      tree.push({
        id: node.uri,
        slug: node.uri,
        title: node.name,
        type: node.type,
        meta: '',
        description: node.data.description || '',
      });
    });
  }
  return tree;
};

export const findFirstNodeSlug = (tree: TableOfContentsItem[]): string | void => {
  for (const item of tree) {
    if ('slug' in item) {
      return item.slug;
    }

    if ('items' in item) {
      const slug = findFirstNodeSlug(item.items);
      if (slug) {
        return slug;
      }
    }
  }

  return;
};

export const isInternal = (node: ServiceChildNode | ServiceNode): boolean => {
  const data = node.data;

  if (isHttpOperation(data)) {
    return !!data.internal;
  }

  if (isHttpService(data)) {
    return false;
  }

  return !!data['x-internal'];
};
