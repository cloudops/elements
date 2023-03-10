import {
  TableOfContentsDivider,
  TableOfContentsGroup,
  TableOfContentsItem,
  TableOfContentsNode,
} from '@stoplight/elements-core';
// @ts-ignore
import type { NodeSearchResult } from '@stoplight/elements-dev-portal';
// @ts-ignore
import { Search as ElementsSearch } from '@stoplight/elements-dev-portal';
import * as React from 'react';
import { useHistory } from 'react-router-dom';

function isGroupNode(n: TableOfContentsItem) {
  return (n as TableOfContentsGroup).items;
}

function isOverview(n: TableOfContentsItem) {
  return (n as TableOfContentsNode).type == 'overview';
}

function isSchema(n: TableOfContentsItem) {
  return (n as TableOfContentsNode).type == 'model';
}

function isNode(n: TableOfContentsItem) {
  return (n as TableOfContentsNode).type;
}

function getMethod(meta: string): string {
  if (!meta) {
    return '';
  }
  const getClassSuffix = (m: string) => {
    switch (m) {
      case 'get':
        return 'success';
      case 'post':
        return 'primary';
      case 'delete':
        return 'danger';
      case 'put':
      case 'patch':
        return 'warning';
      default:
        return 'default';
    }
  };
  return `<span class="sl-font-medium sl-uppercase sl-text-${getClassSuffix(meta)}">${meta}</span>`;
}

type SearchProps = {
  tree: TableOfContentsItem[];
};

function searchScore(search: string, item: NodeSearchResult): number {
  let searchable: string[] = [];
  item.title
    .split(' - ')
    .forEach(t => searchable.push(t));
  searchable.push(item.project_name);
  searchable.push(item.summary);
  searchable.push(item.type);
  searchable.push(item.description);
  const fullScore = searchable.filter(
    s => s.toLowerCase().includes(search.toLowerCase()) || search.toLowerCase().includes(s.toLowerCase()),
  ).length;
  let additional = 0;
  if (!isSchema(item)) {
    additional += 3;
  }
  return fullScore + additional;
}

function createResult(category: string, title: string, item: TableOfContentsItem): NodeSearchResult[] {
  if (isGroupNode(item)) {
    const group = item as TableOfContentsGroup;
    return group.items.flatMap(i => createResult(category, (group.title ? group.title + ' - ' : '') + i.title, i));
  }
  const node = item as TableOfContentsNode;
  const fullTitle = title + ' ' + node.title;
  let substrDescription = node.description.substring(0, 120);
  if (substrDescription.length < node.description.length) {
    substrDescription = substrDescription.replace(/\\s+/, ' ');
    substrDescription += '...';
  }
  return [
    {
      id: node.id,
      type: node.type,
      uri: '',
      slug: node.slug,
      title: fullTitle,
      summary: node.meta,
      project_id: '',
      branch_id: '',
      branch_node_id: 0,
      branch: '',
      highlighted: {
        name: `<div>${title || node.title}</div>`,
        summary: `<div>${getMethod(node.meta)} ${substrDescription}</div>`,
        data: null,
      },
      project_slug: '',
      project_name: category,
      node_id: 0,
      description: node.description,
    },
  ];
}

function searchOpenAPI(search: string, tree: TableOfContentsItem[]): NodeSearchResult[] {
  let category = '';
  let results: NodeSearchResult[] = [];
  const filteredTree = tree.filter(i => !isOverview(i));

  filteredTree.forEach(i => {
    if (isGroupNode(i) || isNode(i)) {
      results = [...results, ...createResult(category, '', i)];
    } else if (i as TableOfContentsDivider) {
      category = (i as TableOfContentsDivider).title;
    }
  });

  return results
    .map(item => ({ item, score: searchScore(search, item) }))
    .sort((a, b) => b.score - a.score)
    .filter(c => c.score > 0)
    .map(c => c.item)
    .slice(0, 50);
}

export const Search: React.FC<SearchProps> = ({ tree }) => {
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<NodeSearchResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const history = useHistory();

  const handleClose = () => {
    setOpen(false);
    setSearch('');
    setResults([]);
  };

  const handleClick = (data: NodeSearchResult) => {
    history.push(data.slug);
    handleClose();
  };

  const debounce = (fn: Function, ms = 300) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return function (this: any, ...args: any[]) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  const debounceSearch = debounce((search: string) => {
    setResults(searchOpenAPI(search, tree));
  });

  const handleSearch = (search: string) => {
    setSearch(search);
    debounceSearch(search);
  };

  return (
    <>
      <input placeholder="Search..." style={{ color: 'white' }} onFocus={() => setOpen(true)} />
      <ElementsSearch
        search={search}
        onSearch={handleSearch}
        onClick={handleClick}
        onClose={handleClose}
        isOpen={open}
        searchResults={results}
      />
    </>
  );
};
