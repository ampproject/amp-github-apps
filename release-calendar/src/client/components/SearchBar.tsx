/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import '../stylesheets/searchBar.scss';
import * as React from 'react';
import {ApiService} from '../api-service';
import {useForm} from 'react-hook-form';
import IconButton from '@material-ui/core/IconButton';
import InputAdornment from '@material-ui/core/InputAdornment';
import SearchIcon from '@material-ui/icons/Search';
import TextField from '@material-ui/core/TextField';

export interface SearchBarProps {
  handleSelectedRelease: (release: string) => void;
}

export interface SearchBarState {
  badSearch: string;
}

type FormData = {
  release: string;
};

export class SearchBar extends React.Component<SearchBarProps, SearchBarState> {
  private apiService: ApiService;
  constructor(props: Readonly<SearchBarProps>) {
    super(props);
    this.state = {
      badSearch: null,
    };
    this.apiService = new ApiService();
  }

  Other = (): JSX.Element => {
    const {register, handleSubmit, watch, errors} = useForm<FormData>({
      mode: 'onChange',
      reValidateMode: 'onChange',
      validateCriteriaMode: 'all',
    });
    const onSubmit = handleSubmit(async ({release}) => {
      if (await this.apiService.isRelease(release)) {
        this.props.handleSelectedRelease(release);
        this.setState({
          badSearch: null,
        });
      } else {
        this.setState({badSearch: `Release ${release} is not found 🤭`});
      }
    });

    const labeltext = (input: string): string => {
      if (input == undefined || input.length == 0) {
        return 'Search for releases...';
      } else {
        const text = errors.release?.types?.pattern ? 'digits only' : '';
        return `${input.length}/13 ${text}`;
      }
    };

    return (
      <React.Fragment>
        <h1 className='title-bar'>Release Search</h1>
        <form onSubmit={onSubmit}>
          <TextField
            name='release'
            error={
              (errors.release?.types?.pattern as boolean) ||
              (errors.release?.types?.maxLength as boolean)
            }
            label={labeltext(watch('release'))}
            helperText={this.state.badSearch}
            fullWidth
            size='small'
            variant='outlined'
            inputRef={register({
              pattern: /^[0-9]*$/,
              required: true,
              maxLength: 13,
              minLength: 13,
            })}
            InputProps={{
              endAdornment: (
                <InputAdornment position='start'>
                  <IconButton type='submit' aria-label='search'>
                    <SearchIcon></SearchIcon>
                  </IconButton>
                </InputAdornment>
              ),
            }}></TextField>
        </form>
      </React.Fragment>
    );
  };

  render(): JSX.Element {
    return <this.Other></this.Other>;
  }
}
